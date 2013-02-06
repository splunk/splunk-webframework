from django import template
from django.conf import settings
from django.utils import importlib
from django.core.urlresolvers import reverse, resolve
from django.template import RequestContext
import json

from tagutils import add_statics, component_context, include

register = template.Library()

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='chart')
@include("splunkui/chart.js")
def chart(context, id, **kwargs):        
    return component_context(context, "appfx-chart", id, "control", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='control')
def control(context, type=None, id=None, **kwargs):
    if not type or not id:
        raise Error("Must supply type and id.")
    return component_context(context, type, id, "control", kwargs)

@register.inclusion_tag('appfx:components/component_loader.html', takes_context=True, name='component_loader')
def component_loader(context):
    return context
    
@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='d3chart')
@include("splunkui/d3chart/d3chart.js")
def d3chart(context, id, *args, **kwargs):
    return component_context(context, "appfx-d3chart", id, "control", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='dataview')
@include('splunkui/dataview.js')
def dataview(context, id, **kwargs):
    return component_context(context, "appfx-dataview", id, "control", kwargs)
        
@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='eventtable')
@include("splunkui/eventtable/eventtable.js")
def eventtable(context, id, **kwargs):
    return component_context(context, "appfx-eventtable", id, "control", kwargs)
    
@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='googlemap')
@include("splunkui/googlemap.js")
def googlemap(context, id, **kwargs):
    return component_context(context, "appfx-googlemap", id, "control", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='jobstatus')
@include("splunkui/jobstatus.js")
def jobstatus(context, id, **kwargs):
    return component_context(context, "appfx-jobstatus", id, "control", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='group')
def group(context, *args, **kwargs):
    if 'id' not in kwargs or not kwargs['id']:
        raise Exception("Must supply an id for 'groupcontext'")
    id = kwargs['id']
    
    add_statics(context, js=["splunkui/groupcontext.js"])
    options = { 
        'app': context['app_name'],
        'contexts': args
    }
    options.update(kwargs) 
    
    return component_context(context, "appfx-groupcontext", id, "context", options)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='paginator')
@include("splunkui/paginator.js")
def paginator(context, id, **kwargs):
    return component_context(context, "appfx-paginator", id, "control", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='radio')
@include('splunkui/forms.js')
def radio(context, id, **kwargs):
    return component_context(context, "appfx-radio", id, "control", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='resulttable')
@include("splunkui/resulttable.js")
def resulttable(context, id, **kwargs):    
    return component_context(context, "appfx-resulttable", id, "control", kwargs)

@register.simple_tag(takes_context=True, name='require')
def require(context, *args, **kwargs):
    args = list(args)
    add_statics(context, js=args);
    return ''

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='savedsearch')
def savedsearch(context, id, **kwargs):
    add_statics(context, js=["splunkui/savedsearchcontext.js"])
    options = { 'app': context['app_name'] }
    options.update(kwargs)
    return component_context(context, "appfx-savedsearchcontext", id, "context", options)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='search')
def search(context, id, **kwargs):
    add_statics(context, js=["splunkui/searchcontext.js"])
    options = { 'app': context['app_name'] }
    options.update(kwargs)
    return component_context(context, "appfx-searchcontext", id, "context", options)
    
@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='searchbar')
@include("splunkui/searchbar.js")
def searchbar(context, id, include_timepicker=True, **kwargs):
    if include_timepicker:
        kwargs["timepicker"] = "1"
    return component_context(context, "appfx-searchbar", id, "control", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='searchcontrols')
@include("splunkui/searchcontrols/searchcontrols.js")
def searchcontrols(context, id, **kwargs):
    return component_context(context, "appfx-searchcontrols", id, "control", kwargs)
    
@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='select')
@include('splunkui/forms.js')
def select(context, id, **kwargs):
    return component_context(context, "appfx-select", id, "control", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='simplexml')
@include("splunkui/dashboard/simplexml.js")
def simplexml(context, id, **kwargs):
    return component_context(context, "simplexml", id, "control", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='single')
@include("splunkui/single.js")
def single(context, id, **kwargs):
    return component_context(context, "appfx-single", id, "control", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='textbox')
@include('splunkui/forms.js')
def textbox(context, id, **kwargs):
    return component_context(context, "appfx-textbox", id, "control", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='timeline')
@include("splunkui/timeline.js")
def timeline(context, id, **kwargs):
    return component_context(context, "appfx-timeline", id, "control", kwargs)

@register.inclusion_tag('appfx:components/component.html', takes_context=True, name='timepicker')
@include("splunkui/timepicker.js")
def timepicker(context, id, **kwargs):
    return component_context(context, "appfx-timepicker", id, "control", kwargs)
    
