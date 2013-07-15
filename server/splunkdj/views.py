from django.core.urlresolvers import reverse, resolve
from django.http import HttpResponseRedirect, Http404
from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
from django.template import TemplateDoesNotExist
from django.shortcuts import render
from splunkdj.decorators.render import render_to
from splunkdj.utility import make_splunkweb_url
from urlparse import urlparse

import logging
logger = logging.getLogger('spl.django.service')
 
def redirector(request, app, view):
    params = {}
    
    for (key, val) in request.GET.iteritems():
        params[key] = val

    full_name = "%s:%s" % (app, view)
    
    if not view or not app:
        logger.error("Redirector requires both 'app' and 'view' to be set, received: app='%s' view='%s'" % (app, view))
        raise Error("Redirector requires both 'app' and 'view' to be set, received: app='%s' view='%s'" % (app, view))
        
    return HttpResponseRedirect(reverse(full_name, kwargs=params))
    
def default_search(request, app):
    lang_code = request.LANGUAGE_CODE
    return HttpResponseRedirect(make_splunkweb_url("/%s/app/%s/search" % (lang_code, app)))
    
def default_flashtimeline(request, app):
    lang_code = request.LANGUAGE_CODE
    return HttpResponseRedirect(make_splunkweb_url("/%s/app/%s/flashtimeline" % (lang_code, app)))

@render_to()
@login_required
def default_template_render(request, app, template_name):
    template_path = "%s:%s.html" % (app, template_name)
    try:
        return render(request, template_path)
    except TemplateDoesNotExist, e:
        logger.error("Default template route matched a template that is not found: %s" % template_path)
        raise Http404("Template '%s' does not exist." % template_path)

@never_cache
@render_to('splunkdj:page_config.html', mimetype="application/javascript")
@login_required
def get_page_config(request):
    referer = request.META.get("HTTP_REFERER", "")
    app = ""
    app_label = ""
    if referer:
        try:
            parsed = urlparse(referer)
            parsed_path = parsed.path.replace("/%s/" % settings.MOUNT, "/")
            resolved = resolve(parsed_path)
            app = resolved.app_name
            
            if app:
                app_label = request.service.apps[app]["label"]
        except Exception, e:
            # If there was an error here, don't kill the entire page
            # just return some default info
            app = app or ""
            app_label = app_label or app
    
    zone_info = request.service.get('/services/search/timeparser/tz').body.read()
    
    return {
        "autoload": "1" == request.GET.get("autoload", "0"),
        "config": {
            "MRSPARKLE_ROOT_PATH": "/%s" % str(settings.SPLUNK_WEB_MOUNT).strip("/"),
            "DJANGO_ROOT_PATH": "/%s" % str(settings.RAW_MOUNT),
            "MRSPARKLE_PORT_NUMBER": str(settings.SPLUNK_WEB_PORT),
            "LOCALE": "en-US",
            "JS_LOGGER_MODE": "None",
            "FORM_KEY": 0,
            "USERNAME": str(request.user.username),
            "USER_DISPLAYNAME": str(request.user.realname),
            "APP": str(app),
            "APP_DISPLAYNAME": str(app_label),
            "SERVER_ZONEINFO": str(zone_info)
        }
    }
