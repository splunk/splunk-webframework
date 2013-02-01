from django.contrib.auth.models import User
from splunklib.client import connect, Service
import requests
import os, time

from django.conf import settings
from encryption import SimplerAES

aes = SimplerAES(settings.SECRET_KEY)

def logout_user(cookies):
    try:
        r1 = requests.get(
           "http://%s:%s/account/logout" % (settings.SPLUNK_WEB_HOST, settings.SPLUNK_WEB_PORT),
           allow_redirects=True,
           cookies=cookies)
    except:
        pass

class SplunkUser(User):
    def __init__(self, id=None, splunkweb=None, service=None, tz=None, realname="", *args, **kwargs):
        super(SplunkUser, self).__init__(*args, **kwargs)
        
        self.id = id
        self.splunkweb = splunkweb
        self.realname = realname
        self.service = service
        self.tz = tz
    
        if self.tz:
            print "Setting timezone to: %s" % self.tz
            os.environ['TZ'] = self.tz
            time.tzset()
            
    def save(self):
        pass

class SplunkWebInfo(object):
    def __init__(self, cookies):
        self.session_id = cookies['session_id_%s' % settings.SPLUNK_WEB_PORT]
        self.cval = cookies['cval']
        self.uid = cookies['uid']

class SplunkAuthenticationBackend(object):
    supports_inactive_user = False
    
    def authenticate(self, username=None, password=None, *args, **kwargs):  
        try:           
            service = connect(
                username=username,
                password=password,
                host=settings.SPLUNKD_HOST,
                port=settings.SPLUNKD_PORT
            )
        except Exception, e:
            if hasattr(e, 'status') and e.status == 401:
                return None
            else:
                raise
        
        user = service.users[username]
        properties = user.content()
        user_id = "%s:%s" % (username, service.token)
        user_id = aes.encrypt(str(user_id))
        
        splunkweb_info = None
        
        try:
            r1 = requests.get(
               "http://%s:%s/account/login" % (settings.SPLUNK_WEB_HOST, settings.SPLUNK_WEB_PORT),
               allow_redirects=True)
            
            cval = r1.cookies['cval']
            r = requests.post(
               r1.url,
               cookies=r1.cookies,
               data={"username":username, "password":password, "cval":cval})
            
            splunkweb_info = SplunkWebInfo(r.cookies)
        except:
            pass
        
        # TODO: We need to find a better way to do this, specifically,
        # the way we pass the session_id, which are the Splunkweb cookie
        # values, is a hack.
        return SplunkUser(
            id=user_id,
            splunkweb=splunkweb_info,
            service=service,
            username=username, 
            password=password, 
            email=properties["email"],
            is_superuser="admin" in properties["roles"],
            is_staff="admin" in properties["roles"],
            is_active=True,
            realname=properties["realname"],
            tz=properties['tz']
        )
        
    def get_user(self, user_id, *args, **kwargs):
        username = None
        token = None
        try:
            user_id = aes.decrypt(user_id)
            parts = user_id.split(":")
            username = parts[0]
            token = parts[1]
        except Exception, e:
            return None
        
        user = None
        try:
            service = Service(
                username=username, 
                token=token, 
                host=settings.SPLUNKD_HOST,
                port=settings.SPLUNKD_PORT
            )
            user = service.users[username]
        except Exception, e:
            if hasattr(e, 'status') and e.status == 401:
                return None
            elif settings.DEBUG:
                raise
            else:
                return None
        
        properties = user.content()
        
        return SplunkUser(
            id=user_id,
            service=service,
            username=username,
            email=properties["email"],
            is_superuser="admin" in properties["roles"],
            is_staff="admin" in properties["roles"],
            is_active=True,
            realname=properties["realname"],
            tz=properties['tz']
        )