from django import template
from django.conf import settings
from django.utils import importlib
from django.core.urlresolvers import reverse, resolve
from django.template import RequestContext

from splunklib import binding

register = template.Library()

def _getattr(obj, attr):
    return getattr(obj, attr) if hasattr(obj, attr) else None

@register.assignment_tag
def get_user_apps():
    user_apps = list(settings.USER_APPS)
    user_apps.remove('homefx')
    
    def get_name_and_url(app):
        app_module = importlib.import_module(app)
        
        if hasattr(app_module, '__label__'):
            app_name = app_module.__label__
        else:
            app_name = app
        
        app_url = reverse("%s:home" % app)
    
        return {
            'name': app_name,
            'url': app_url
        }
        
    apps = map(get_name_and_url, user_apps)
    apps = sorted(apps, key=lambda app: app['name'].lower())
    
    return apps
    
@register.assignment_tag(takes_context=True)
def get_splunk_apps(context):
    service = context['request'].service
    apps = service.apps.list()
    
    def filter_visible_and_enabled(app):
        visible = app['visible'] == '1'
        enabled = app['disabled'] != '1'
        
        return visible and enabled
    
    def get_name_and_url(app):
        app_name = app['label']
        app_url = "/en-US/app/%s" % app.name
    
        return {
            'name': app_name,
            'url': app_url
        }    
    
    # A hackish way to exclude apps in splunkweb that are only there to
    # provide cross-nav
    namespace = service.namespace
    service.namespace = binding.namespace(owner="-", app="-")
    try:
        exclude = {}
        stanzas = service.confs['app'].list()
        for stanza in stanzas:
            if stanza.name == "appfx":
                app_name = stanza.access['app']
                should_exclude = stanza['appfx'] == '1'
                exclude[app_name] = should_exclude
                
        apps = filter(lambda app: not exclude.get(app.name, False), apps)
    except:
        raise
    finally:
        service.namespace = namespace
    
    apps = filter(filter_visible_and_enabled, apps)
    apps = map(get_name_and_url, apps)
    apps = sorted(apps, key=lambda app: app['name'].lower())
    
    return apps
    
@register.assignment_tag(takes_context=True)    
def get_apps(context):
    user_apps = get_user_apps()
    splunk_apps = get_splunk_apps(context)
    
    return sorted(user_apps + splunk_apps, key=lambda app: app['name'].lower())

@register.simple_tag()
def get_app_name(app_path):
    app = importlib.import_module(app_path)
    return _getattr(app, "__label__") or app_path

@register.simple_tag(takes_context=True)
def ensure_request_context(context):
    if not isinstance(context, RequestContext):
        raise Exception("Must use RequestContext")
    
    return ''
    
@register.assignment_tag(takes_context=True)
def get_current_app(context):
    request = context['request']
    resolved = resolve(request.path_info)
    app_name = resolved.app_name
    app = importlib.import_module(app_name)
    return app
    
@register.assignment_tag(takes_context=True)
def get_app_nav(context, app):
    if hasattr(app, 'NAV'):
        return app.NAV or []
    else:
        try:
            importlib.import_module(".nav", app.__name__)
            return app.nav.NAV
        except:
            pass
    return []