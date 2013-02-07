import json

def component_context(context, type, id, component_type, require_file, kwargs):
    """Returns a component template context constructed from the given args."""
    options = { 'app': context['app_name'] }
    options.update(kwargs)
    return {
        "type": type,
        "id": id,
        "component_type": component_type,
        "style": "display: none;" if component_type == "context" else "",
        "require_file": require_file,
        "options": json.dumps(options)
    }