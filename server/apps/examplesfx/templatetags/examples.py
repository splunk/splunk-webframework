from django import template
from splunkdj.templatetags.tagutils import component_context

register = template.Library()

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True)
def globe(context, id, *args, **kwargs):
    return component_context(
        context, 
        "custom-globe",        # Splunk registry name
        id, 
        "view",
        "examplesfx/globefx",  # Path to javascript library
        kwargs
    )

@register.inclusion_tag('splunkdj:components/component.html', takes_context=True)
def sankey(context, id, *args, **kwargs):
    return component_context(
        context, 
        "custom-sankey",        # Splunk registry name
        id, 
        "view",
        "examplesfx/sankeyfx", # Path to javascript library
        kwargs
    )
