from django.conf.urls import patterns, include, url
from appfx.utility.views import render_template as render

urlpatterns = patterns('',
    url(r'^home/$', 'setupfx.views.home', name='home'),
    url(r'^setup/$', 'setupfx.views.setup', name='setup'),
)
