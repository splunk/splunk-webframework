# Copyright 2012 Splunk, Inc.

from django.contrib.auth.decorators import login_required
from django.http import Http404
from django.http import HttpResponse 
from django.http import HttpResponseBadRequest
from django.http import HttpResponseServerError
from django.shortcuts import render_to_response
from django.template import RequestContext
from django.utils import importlib
import json
from os import path
from xml.etree import ElementTree
from xml.etree.ElementTree import XML

from splunklib import data

def load_elem(element, ignore=None):
    """Load the given XML element as a `dict`, skipping any child elements
       listed in the given `ignore` argument."""
    result = data.load_attrs(element) or {}
    result['kind'] = element.tag
    for child in list(element):
        if ignore and child.tag in ignore: continue
        name, value = data.load_elem(child)
        result[name] = value
    return result

def load_list(element, pattern, loader=load_elem):
    return [loader(item) for item in element.findall(pattern)]

# <choice value="..">key</choice>
def load_choice(element):
    result = {}
    result['label'] = element.text
    result['value'] = element.attrib['value']
    return result

def load_input(element):
    result = load_elem(element, "choice")
    choices = load_list(element, "choice", load_choice)
    if len(choices) > 0: result['options'] = {'choices': choices}
    return result

def load_layout(element):
    """Load layout data from the given XML element."""
    # Load everything except for the row & fieldset elements
    result = load_elem(element, ignore=["row", "fieldset"])

    # Load the form fieldset as a simple array of elements
    if element.tag == "form":
        fieldset = element.find("fieldset")
        result['fieldset'] = load_elem(fieldset, ignore="input")
        result['fieldset']['inputs'] = load_list(fieldset, "input", load_input)

    # Collect all row elements into an array of row objects
    rows = []
    for item in element.findall("row"):
        row = data.load_attrs(item) or {}
        row['panels'] = [load_panel(panel) for panel in list(item)]
        rows.append(row)
    result['rows'] = rows

    return result

def load_panel(element):
    """Load dashboard panel view data from the given XML element."""

    # Project the tag name as a panel `kind` property and project all option
    # child elements onto a simple options record.
    result = { 'kind': element.tag }

    # Special case <html> panels, which are just literal HTML
    if element.tag == "html":
        result['content'] = ElementTree.tostring(element)
    else:
        for child in list(element):
            if child.tag == "option":
                k = child.attrib['name']
                v = child.text
                if 'options' not in result: 
                    result['options'] = {}
                result['options'][k] = v
            else:
                k, v = data.load_elem(child)
                result[k] = v

    return result

def load_simplexml(xml):
    """Load the given Simple XML file and convert to a Python dict
       with a slightly more explicit structure."""
    content = XML(xml)

    if content.tag not in ["dashboard", "form"]:
        raise Http404 # This is not the resorce we thougth it was

    return load_layout(content)

@login_required
def render_viewdata(request, **kwargs):
    """Render the request for the given Simple XML file. The request is
       rendered according to the `output_mode` query argument as XML, JSON 
       or HTML (default)."""

    if not request.method == "GET":
        return HttpResponseBadRequest()

    viewpath = kwargs.get('path', None)
    if not viewpath:
        raise HttpResponseServerError()

    splunkapp = kwargs.get('app', None)

    output_mode = request.GET.get('output_mode', "json").lower()
    if not output_mode in ["json", "xml"]:
        return HttpResponseBadRequest()

    if not splunkapp:
        raise HttpResponseServerError("Must supply app for SimpleXML")
        
    appmodule = importlib.import_module(splunkapp)
    if not appmodule:
        raise HttpResponseServerError("App '%s' does not exist for SimpleXML" % splunkapp) 
        
    app_path = path.dirname(path.abspath(appmodule.__file__))
    abspath = path.join(app_path, viewpath + ".xml")

    if not path.exists(abspath):
        # If the path doesn't exist locally, we try and load it from splunkd
        from splunklib.client import Collection, Entity
        splunkapp = splunkapp or "search"
        views = Collection(request.service, 
            "/servicesNS/nobody/%s/data/ui/views" % str(splunkapp))
        
        try:
            view = views[viewpath]
        except:
            raise Http404
            
        try:
            xml = view["eai:data"]     
        except Exception as e:
            raise Http404
    else:
        try:
            xml = open(abspath).read()
        except Exception as e:
            print "Error reading simplexml file: %s" % abspath
            raise Http404

    if output_mode == "xml":
        try:
            content = xml
            return HttpResponse(content, mimetype="text/xml")
        except: 
            raise Http404

    if output_mode == "json":
        try:
            content = load_simplexml(xml)
            content = json.dumps(content)
            # Using mimetype="application/json" can make Firefox and IE unhappy
            return HttpResponse(content, mimetype="text/plain")
        except Exception as e:
            print "Error parsing Simple XML: '%s'" % e.message
            raise Http404

    return HttpResponseServerError() # 500

@login_required
def render_template(request, **kwargs):
    """Render the `page` template named in the given `kwargs`."""
    page = kwargs.get('page', None)
    if not page: raise Http404
    return render_to_response(
        "simplexml:%s.html" % page,
        context_instance=RequestContext(request))
