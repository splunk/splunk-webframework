from optparse import make_option

from django.core.management.base import AppCommand
from django.conf import settings
from django.utils import importlib

from splunklib.client import connect
from splunklib import binding
from time import sleep

def restart(service, timeout=120):
    """Restart the given service and wait for it to wake back up."""
    service.restart()
    sleep(5) # Wait for service to notice restart
    secs = 0
    while secs < timeout:
        try:
            service.login() # Awake yet?
            return
        except:
            sleep(2)
            secs -= 2 # Approximately
    raise Exception, "Operation timed out."

class Command(AppCommand):
    help = "Install AppFx placeholders on Splunk"

    option_list = AppCommand.option_list + (
        make_option('--username', action='store', dest='username',
            default='admin', help=''),
        make_option('--password', action='store', dest='password',
            default='changeme', help='')
    )

    def handle(self, **options):
        service = connect(
            username=options['username'],
            password=options['password'],
            host=settings.SPLUNKD_HOST,
            port=settings.SPLUNKD_PORT,
        )
        
        user_apps = list(settings.USER_APPS)
        apps = service.apps
        
        did_delete = False
        for app in apps:
            namespace = service.namespace
            service.namespace = binding.namespace(owner="nobody", app=app.name)
            is_appfx = app.name in user_apps and 'appfx' in service.confs['app']
            service.namespace = namespace
            if is_appfx:
                print "Uninstalling '%s'" % app.name
                service.namespace = namespace
                apps.delete(app.name)
                did_delete = True
                
        if did_delete:
            print "Restarting..."
            restart(service)
        
        for user_app in user_apps:
            print "Installing '%s'" % user_app
            
            user_app_module = importlib.import_module(user_app)
            
            label = user_app
            if hasattr(user_app_module, 'NAME'):
                label = user_app_module.NAME
                
            apps.create(user_app, visible=True, label=label)
            
            service.namespace = binding.namespace(owner="nobody", app=user_app)
            stanza = service.confs['app'].create('appfx')
            stanza.submit("appfx=1")
            
            nav_kwargs = {
                "eai:data": '<nav><view name="default" default="true"/></nav>'
            }
            view_kwargs = {
                "name": "default",
                "eai:data": '<view template="appfx_base:/templates/redirect.html"></view>'
            }
            
            service.post(
                'data/ui/views',
                **view_kwargs
            )
            
            service.post(
                'data/ui/nav/default',
                **nav_kwargs
            )

        