from django.conf import settings
from django.utils import importlib
from django.core.urlresolvers import reverse, resolve

NAV = [
    {
        "name": "Examples Home",
        "link": reverse("examplesfx:home")
    },
    {
        "name": "Basics",
        "link": "#",
        "children": [
            {
                "name": "Dashboard in Django",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "dashboard"})
            },
            {
                "name": "Dashboard in JavaScript",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "dashboardjs"})
            },
            {
                "name": "Saved Searches",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "savedsearch"})
            },
            {
                "name": "Caching",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "cache"})
            },
        ]
    },
    {
        "name": "Search, Forms and Timepickers",
        "link": "#",
        "children": [
            {
                "name": "Forms and Timepickers",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "form"})
            },
            {
                "name": "Cascading Forms",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "cascade"})
            },
            {
                "name": "Search Properties",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "properties"})
            },
            {
                "name": "Timepickers",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "timepicker"})
            },
            {
                "name": "Timepicker Groups",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "timepicker_group"})
            },
            {
                "name": "Search Timeline UI",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "search"})
            },
        ]
    },
    {
        "name": "Interactivity",
        "link": "#",
        "children": [
            {
                "name": "Interactive Controls",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "interactive"})
            },
            {
                "name": "Table Expansion",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "tableexpand"})
            },
        ]
    },
    {
        "name": "Simple XML",
        "link": "#",
        "children": [
            {
                "name": "Basic Dashboard",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "simplexml"})
            },
            {
                "name": "Basic Form",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "simplexml_form"})
            },
            {
                "name": "Multiple Dashboards",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "simplexml_multi"})
            },
            {
                "name": "SimpleXML Hybrid",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "simplexml_hybrid"})
            },
        ]
    },
    {
        "name": "Advanced",
        "link": "#",
        "children": [
            {
                "name": "Custom Control",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "customcontrol"})
            },
            {
                "name": "Drilldown",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "drilldown"})
            },
            {
                "name": "Permalinking",
                "link": "%s?sourcetype=splunkd&index=_internal" % reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "permalink"})
            },
            {
                "name": "Custom Styles",
                "link": reverse("examplesfx:tmpl_render", kwargs={ "tmpl": "customcss"})
            },
        ]
    },
    {
        "name": "Quick Start",
        "link": reverse("quickstartfx:home")
    },
    {
        "name": "ComponentFx",
        "link": reverse("componentfx:home")
    },
]