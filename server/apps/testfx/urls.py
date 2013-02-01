from django.conf.urls import patterns, include, url
from appfx.utility.views import render_template as render

urlpatterns = patterns('',
    url(r'^home/$', render('testfx:tests.html'), name='home'), 
)
