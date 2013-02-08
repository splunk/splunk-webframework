from django.shortcuts import redirect
from django.contrib.auth.decorators import login_required
from appfx.decorators.render import render_to

controlsDict = ["resulttable",
                "single",
                "searchbar",
                "timepicker",
                "timeline",
                "eventtable",
                "forms",
                "charts",
                "googlemap",
                "d3chart",
]

@render_to()
@login_required
def controls_view(request, id="controls"):
    if not id in controlsDict:  
        id = "controls"
    return {"TEMPLATE": "testfx:%s.html" % id}

@render_to()
@login_required
def next_view(request, id="controls"):
    if id in controlsDict:
        index = controlsDict.index(id)
        next = index + 1
        id = "controls" if next >= len(controlsDict) else controlsDict[next]
    return    redirect('testfx:controls', id=id)
    