import sys
import re
import json

from os import path, makedirs
from copy import deepcopy

from django.core.urlresolvers import RegexURLPattern, RegexURLResolver
from django.core.management.base import BaseCommand
from django.utils import simplejson
from django.utils.datastructures import SortedDict
from django.conf import settings
from django.template import loader, Context

def create_config():
    dirpath = path.join(settings.STATIC_ROOT, settings.JS_CACHE_DIR)
    filepath = path.join(settings.STATIC_ROOT, settings.JS_CACHE_DIR, "config.js")
    
    tmpl = loader.get_template('splunkdj:config.html')
    ctx = Context({ "config": json.dumps(settings.CLIENT_CONFIG) })
    rendered = tmpl.render(ctx)
    
    if not path.exists(dirpath):
        makedirs(dirpath)
    
    output_file = open(filepath, 'w')
    output_file.write(rendered)
    output_file.flush()
    
    output_file.close()