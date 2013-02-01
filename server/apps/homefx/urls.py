# Copyright 2012 Splunk, Inc.

from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.conf.urls import patterns, include, url

urlpatterns = patterns('',
    url(r'^$', 'homefx.views.home', name='home'),
    url(r'^logout/$', "appfx.auth.views.logout", name="logout"),
)
