from django import template
from django.conf import settings
from django.utils import importlib
from django.core.urlresolvers import reverse, resolve
from django.template import RequestContext
import json

from tagutils import component_context

register = template.Library()

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='chart')
def chart(context, id, **kwargs):        
    return component_context(context, "appfx-chart", id, "control", "splunk.mvc/chart", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='control')
def control(context, type=None, id=None, require='', **kwargs):
    if not type or not id:
        raise Error("Must supply type and id.")
    return component_context(context, type, id, "control", require, kwargs)

@register.inclusion_tag('appfx:components/component_loader.html', takes_context=True, name='component_loader')
def component_loader(context):
    return context
    
@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='d3chart')
def d3chart(context, id, *args, **kwargs):
    return component_context(context, "appfx-d3chart", id, "control", "splunk.mvc/d3chart/d3chart", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='dataview')
def dataview(context, id, **kwargs):
    return component_context(context, "appfx-dataview", id, "control", "splunk.mvc/dataview", kwargs)
        
@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='eventtable')
def eventtable(context, id, **kwargs):
    return component_context(context, "appfx-eventtable", id, "control", "splunk.mvc/eventtable/eventtable", kwargs)
    
@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='googlemap')
def googlemap(context, id, **kwargs):
    return component_context(context, "appfx-googlemap", id, "control", "splunk.mvc/googlemap", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='jobstatus')
def jobstatus(context, id, **kwargs):
    return component_context(context, "appfx-jobstatus", id, "control", "splunk.mvc/jobstatus", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='group')
def group(context, *args, **kwargs):
    if 'id' not in kwargs or not kwargs['id']:
        raise Exception("Must supply an id for 'groupcontext'")
    id = kwargs['id']
    
    options = { 
        'app': context['app_name'],
        'contexts': args
    }
    options.update(kwargs) 
    
    return component_context(context, "appfx-groupcontext", id, "context", "splunk.mvc/groupcontext", options)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='paginator')
def paginator(context, id, **kwargs):
    return component_context(context, "appfx-paginator", id, "control", "splunk.mvc/paginator", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='radio')
def radio(context, id, **kwargs):
    return component_context(context, "appfx-radio", id, "control", "splunk.mvc/forms", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='resulttable')
def resulttable(context, id, **kwargs):    
    return component_context(context, "appfx-resulttable", id, "control", "splunk.mvc/resulttable", kwargs)

@register.simple_tag(takes_context=True, name='require')
def require(context, *args, **kwargs):
    args = list(args)
    return ''

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='savedsearch')
def savedsearch(context, id, **kwargs):
    options = { 'app': context['app_name'] }
    options.update(kwargs)
    return component_context(context, "appfx-savedsearchcontext", id, "context", "splunk.mvc/savedsearchcontext", options)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='search')
def search(context, id, **kwargs):
    options = { 'app': context['app_name'] }
    options.update(kwargs)
    return component_context(context, "appfx-searchcontext", id, "context", "splunk.mvc/searchcontext", options)
    
@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='searchbar')
def searchbar(context, id, include_timepicker=True, **kwargs):
    if include_timepicker:
        kwargs["timepicker"] = "1"
    return component_context(context, "appfx-searchbar", id, "control", "splunk.mvc/searchbar", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='searchcontrols')
def searchcontrols(context, id, **kwargs):
    return component_context(context, "appfx-searchcontrols", id, "control", "splunk.mvc/searchcontrols/searchcontrols", kwargs)
    
@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='select')
def select(context, id, **kwargs):
    return component_context(context, "appfx-select", id, "control", "splunk.mvc/forms", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='simplexml')
def simplexml(context, id, **kwargs):
    return component_context(context, "simplexml", id, "control", "splunk.mvc/dashboard/simplexml", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='single')
def single(context, id, **kwargs):
    return component_context(context, "appfx-single", id, "control", "splunk.mvc/single", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='textbox')
def textbox(context, id, **kwargs):
    return component_context(context, "appfx-textbox", id, "control", "splunk.mvc/forms", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='timeline')
def timeline(context, id, **kwargs):
    return component_context(context, "appfx-timeline", id, "control", "splunk.mvc/timeline", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='timepicker')
def timepicker(context, id, **kwargs):
    return component_context(context, "appfx-timepicker", id, "control", "splunk.mvc/timepicker", kwargs)
    
