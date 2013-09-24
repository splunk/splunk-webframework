from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.conf.urls import patterns, include, url
from django.core.urlresolvers import reverse, RegexURLPattern
from django.conf import settings
from django.conf.urls.i18n import i18n_patterns
from django.utils import importlib
    
import sys

from django.http import HttpResponseRedirect

import logging

logger = logging.getLogger('spl.django.service')

def redirect_to_default_app(request):
    home = "%s:home" % settings.DEFAULT_APP
    reversed = "/%s/" % settings.DEFAULT_APP
    try:
        reversed = reverse(home)
    except Exception, e:
        logger.exception(e)
        pass
        
    return HttpResponseRedirect(reversed)
    
def redirect_to_home(app):
    def redirect_internal(request):
        home = "%s:home" % app
        reversed = "/%s/" % app
        try:
            reversed = reverse(home)
        except Exception, e:
            logger.exception(e)
            pass
            
        return HttpResponseRedirect(reversed)
    
    return redirect_internal
    
# Set the Django error views
handler404 = 'splunkdj.views.handle404'
handler500 = 'splunkdj.views.handle500'
    
urlpatterns = i18n_patterns('',
    # Examples:
    # url(r'^$', 'testsite.views.home', name='home'),
    # url(r'^testsite/', include('testsite.foo.urls')),
    url(r'^$', redirect_to_default_app, name='home'),
    url(r'^accounts/login/$', 'splunkdj.auth.views.login', name="login"),
    url(r'^accounts/logout/$', 'splunkdj.auth.views.logout', name="logout"),
    url(r'^page_config/$', 'splunkdj.views.get_page_config', name="page_config"),
    url(r'^redirector/(?P<app>\w+)/(?P<view>.+)/$', 'splunkdj.views.redirector', name="redirector"),
)

for app in settings.USER_APPS:
    app_prefix = r'^%s/' % app
    urls = None
    try:
        # We first try and load the {app}.urls module, and then get the 
        # urlpatterns from there.
        app_urls_module = "%s.urls" % app
        app_urls = importlib.import_module(app_urls_module)
        urls = app_urls.urlpatterns
    except Exception, e:
        # There is no urls module, so we look for urlpatterns on the app itself,
        # which might be the case for single-file apps
        app_module = importlib.import_module(app)
        if hasattr(app_module, 'urlpatterns'):
            urls = app_module.urlpatterns
        else:
            logger.debug("Could not find any urlpatterns for '%s'" % app)

        logger.exception(e);

                        
    if urls:
        # It could be that the app has no 'home' view, so we simply use
        # first view in the list
        has_home = len(filter(lambda url: url.name is 'home', urls))
        if not has_home:
            first_url = urls[0]
            home_url = RegexURLPattern(
                first_url.regex.pattern, 
                first_url.callback, 
                first_url.default_args, 
                'home'
            )
            urls.insert(0, home_url)
    
        # In case the user didn't add any urlpattern at the root,
        # we add one for them. This one will never be hit if the user
        # defined one.
        urls.append(url(r'^$', redirect_to_home(app)))
        
        # We're going to add some catch-all routes, namely:
        # /<app>/flashtimeline -> /<locale>/app/<app>/flashtimeline
        # /<app>/search -> /<locale>/app/<app>/search
        # /<app>/<template_name> -> will render that template in that app
        # Again, if the user has defined anything that matches these, then the
        # catch-all ones will never be hit.
        urls += (
            url(r'^flashtimeline/$', 'splunkdj.views.default_flashtimeline', name="flashtimeline"),
            url(r'^search/$', 'splunkdj.views.default_search', name="search"),
            url(r'^(?P<template_name>[\w_\-/]+)/$', 'splunkdj.views.default_template_render', name="template_render"),
        )
    
        urlpatterns += i18n_patterns('', 
            (app_prefix, include(urls, namespace=app, app_name=app))
        )
        
        
from splunkdj.utility import jsurls, config
jsurls.create_javascript_urlpatterns()
config.create_config()
