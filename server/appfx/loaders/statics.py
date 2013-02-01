from django.contrib.staticfiles.finders import BaseFinder
from django.conf import settings
import os

class StaticRootFinder(BaseFinder):
    def __init__(self, apps=None, *args, **kwargs):
        super(StaticRootFinder, self).__init__(*args, **kwargs)

    def find(self, path, all=False):
        """
        Looks for files in the extra locations
        as defined in ``STATIC_ROOT``.
        """
        abs_path = os.path.join(settings.STATIC_ROOT, path)
        if os.path.exists(abs_path):
            return abs_path if not all else [abs_path]
        return []