from django.conf.urls import patterns, include, url
from splunkdj.utility.views import render_template as render

urlpatterns = patterns('', 
    url(r'^home/$', render('componentfx:home.html'), name='home'), 
    url(r'^basics/$', render('componentfx:basics.html'), name='basics'),
    url(r'^contexts/$', render('componentfx:managers.html'), name='managers'),
    url(r'^charts/$', render('componentfx:charts.html'), name='charts'),
    url(r'^tables/$', render('componentfx:tables.html'), name='tables'),
    url(r'^forms/$', render('componentfx:forms.html'), name='forms'),
    url(r'^dataview/$', render('componentfx:dataview.html'), name='dataview'),
    url(r'^searchcontrols/$', render('componentfx:searchcontrols.html'), name='searchcontrols'),
    url(r'^map/$', render('componentfx:map.html'), name='map'),
)
