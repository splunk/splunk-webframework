from django import template
from django.conf import settings
from django.utils import importlib
from django.core.urlresolvers import reverse, resolve
from django.template import RequestContext
import json
from splunkdj.tokens import TokenSafeString
from tagutils import component_context

register = template.Library()

# === Filters ===

@register.filter
def token_safe(value):
    return TokenSafeString(value)

# === Inclusion Tags ===

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='chart')
def chart(context, id, **kwargs):        
    return component_context(context, "splunk-chart", id, "view", "splunkjs/mvc/chartview", kwargs)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='view')
def view(context, type=None, id=None, require='', **kwargs):
    if not type or not id:
        raise Error("Must supply type and id.")
    return component_context(context, type, id, "view", require, kwargs)

@register.inclusion_tag('splunkdj:components/component_loader.html', takes_context=True, name='component_loader')
def component_loader(context):
    return context
    
@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='d3chart')
def d3chart(context, id, *args, **kwargs):
    return component_context(context, "splunk-d3chart", id, "view", "splunkjs/mvc/d3chart/d3chartview", kwargs)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='dataview')
def dataview(context, id, **kwargs):
    return component_context(context, "splunk-dataview", id, "view", "splunkjs/mvc/dataview", kwargs)
        
@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='eventsviewer')
def eventsviewer(context, id, **kwargs):
    if settings.SPLUNK_5:
        return resulttable(context, id, **kwargs)
    else:
        return component_context(context, "splunk-events-viewer", id, "view", "splunkjs/mvc/eventsviewerview", kwargs)
    
@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='googlemap')
def googlemap(context, id, **kwargs):
    return component_context(context, "splunk-googlemap", id, "view", "splunkjs/mvc/googlemapview", kwargs)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='paginator')
def paginator(context, id, **kwargs):
    return component_context(context, "splunk-paginator", id, "view", "splunkjs/mvc/paginatorview", kwargs)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='radiogroup')
def radiogroup(context, id, **kwargs):
    return component_context(context, "splunk-radiogroup", id, "view", "splunkjs/mvc/radiogroupview", kwargs)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='resulttable')
def resulttable(context, id, **kwargs):    
    return component_context(context, "splunk-table", id, "view", "splunkjs/mvc/tableview", kwargs)

@register.simple_tag(takes_context=True, name='require')
def require(context, *args, **kwargs):
    args = list(args)
    return ''

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='savedsearchmanager')
def savedsearchmanager(context, id, **kwargs):
    options = { 'app': context['app_name'] }
    options.update(kwargs)
    return component_context(context, "splunk-savedsearchmanager", id, "manager", "splunkjs/mvc/savedsearchmanager", options)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='searchmanager')
def searchmanager(context, id, **kwargs):
    options = { 'app': context['app_name'] }
    options.update(kwargs)
    return component_context(context, "splunk-searchmanager", id, "manager", "splunkjs/mvc/searchmanager", options)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='postprocessmanager')
def postprocessmanager(context, id, **kwargs):
    options = { 'app': context['app_name'] }
    options.update(kwargs)
    return component_context(context, "splunk-postprocessmanager", id, "manager", "splunkjs/mvc/postprocess", options)
    
@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='searchbar')
def searchbar(context, id, timepicker=True, **kwargs):
    kwargs['timepicker'] = timepicker;
    return component_context(context, "splunk-searchbar", id, "view", "splunkjs/mvc/searchbarview", kwargs)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='searchcontrols')
def searchcontrols(context, id, **kwargs):
    return component_context(context, "splunk-searchcontrols", id, "view", "splunkjs/mvc/searchcontrolsview", kwargs)
    
@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='select')
def select(context, id, **kwargs):
    return component_context(context, "splunk-select", id, "view", "splunkjs/mvc/selectview", kwargs)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='multiselect')
def multiselect(context, id, **kwargs):
    return component_context(context, "splunk-multiselect", id, "view", "splunkjs/mvc/multiselectview", kwargs)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='single')
def single(context, id, **kwargs):
    return component_context(context, "splunk-single", id, "view", "splunkjs/mvc/singleview", kwargs)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='textbox')
def textbox(context, id, **kwargs):
    return component_context(context, "splunk-textbox", id, "view", "splunkjs/mvc/textboxview", kwargs)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='checkbox')
def checkbox(context, id, **kwargs):
    return component_context(context, "splunk-checkbox", id, "view", "splunkjs/mvc/checkboxview", kwargs)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='checkboxgroup')
def checkboxgroup(context, id, **kwargs):
    return component_context(context, "splunk-checkboxgroup", id, "view", "splunkjs/mvc/checkboxgroupview", kwargs)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='timeline')
def timeline(context, id, **kwargs):
    return component_context(context, "splunk-timeline", id, "view", "splunkjs/mvc/timelineview", kwargs)

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='timepicker')
def timepicker(context, id, **kwargs):
    return component_context(context, "splunk-timepicker", id, "view", "splunkjs/mvc/timepickerview", kwargs)

@register.inclusion_tag('splunkdj:components/header.html', takes_context=True, name='header')
def header(context, id, **kwargs):
    header_file = "splunkjs/mvc/aceheader/aceheader" if settings.SPLUNK_5 else "splunkjs/mvc/headerview"
    return component_context(context, "splunk-header", id, "view", header_file, kwargs, tag="header")

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='footer')
def footer(context, id, **kwargs):
    return component_context(context, "splunk-footer", id, "view", "splunkjs/mvc/footerview", kwargs, tag="footer")

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True, name='splunkmap')
def splunkmap(context, id, **kwargs):
    return component_context(context, "splunk-map", id, "view", "splunkjs/mvc/splunkmapview", kwargs)
    
