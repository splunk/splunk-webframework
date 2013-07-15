from django.conf.urls import patterns, include, url
from splunkdj.utility.views import render_template as render

urlpatterns = patterns('',
    url(r'^home/$', render('testfx:home.html'), name='home'),
    url(r'^contexts/$', render('testfx:contexttests.html'), name='contexts'), 
    
    # Control tests
    url(r'^controls/controls/$', render('testfx:home.html'), name='controlshome'),
    url(r'^controls/next/(?P<id>.*)/$', 'testfx.views.next_controls_view', name='next'), 
    url(r'^controls/(?P<id>.*)/$', 'testfx.views.controls_view', name='controls'),
    
    # Setup views used by the server-side tests
    url(r'^setup/$', 'testfx.views.setup', name='setup'),
    url(r'^setup_with_stock_form/$', 'testfx.views.setup_with_stock_form', name='setup_with_stock_form'),
    url(r'^setup_with_stock_field/$', 'testfx.views.setup_with_stock_field', name='setup_with_stock_field'),
    url(r'^home_with_config_required/$', 'testfx.views.home_with_config_required', name='home_with_config_required'),
    url(r'^home_with_config_required_only/$', 'testfx.views.home_with_config_required_only', name='home_with_config_required_only'),
)
