import json

def add_statics(context, js=None, css=None):
    js_storage = context['js_statics']
    css_storage = context['css_statics']
    
    if js:
        if not isinstance(js, list):
            js = [js]
        
        for x in js:
            js_storage[x[:-3]] = True
            
    if css:
        if not isinstance(css, list):
            css = [css]
        
        for x in css:
            css_storage[x] = True 

def component_context(context, type, id, component_type, kwargs):
    """Returns a component template context constructed from the given args."""
    options = { 'app': context['app_name'] }
    options.update(kwargs)
    return {
        "type": type,
        "id": id,
        "component_type": component_type,
        "style": "display: none;" if component_type == "context" else "",
        "options": json.dumps(options)
    }
            
def include(*files):
    def dec(func):
        def intercept_func(context, *args, **kwargs):
            add_statics(context, js=list(files))
            return func(context, *args, **kwargs)
        
        return intercept_func
    return dec
