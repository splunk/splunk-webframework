from django.conf.urls import patterns, include, url
from appfx.utility.views import render_template as render

urlpatterns = patterns('',
    url(r'^home/$', 'componentfx.views.home', name='home'), 
    url(r'^test/$', 'componentfx.views.test', name='test'),
)
