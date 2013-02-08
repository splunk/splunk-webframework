from django.conf.urls import patterns, include, url
from appfx.utility.views import render_template as render

urlpatterns = patterns('',
    url(r'^home/$', render('testfx:tests.html'), name='home'),
    url(r'^controls/next/(?P<id>.*)/$', 'testfx.views.next_view', name='next'), 
    url(r'^controls/(?P<id>.*)/$', 'testfx.views.controls_view', name='controls'), 
)
