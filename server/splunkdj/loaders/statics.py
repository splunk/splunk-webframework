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
        
class SplunkWebStaticFinder(BaseFinder):
    """
    A static file finder that will look for files under
    $SPLUNK_HOME/share/splunk/search_mrsparkle/exposed
    """
    
    def __init__(self, apps=None, *args, **kwargs):
        super(SplunkWebStaticFinder, self).__init__(*args, **kwargs)
        
        if "SPLUNK_HOME" not in os.environ:
            self.search_roots = []
        else:            
            splunk_home = os.environ['SPLUNK_HOME']
            exposed_root = os.path.join(splunk_home, "share", "splunk", "search_mrsparkle", "exposed")
            
            # Get all the subdirectories in the exposed root
            exposed_dirs = filter(
                lambda f: os.path.exists(f),
                map(
                    lambda f: os.path.join(exposed_root, f),
                    os.listdir(exposed_root)
                )
            )
            
            exposed_dirs.insert(0, exposed_root)
            self.search_roots = exposed_dirs
                    
    def find(self, path, all=False):
        """
        Looks for files under
        $SPLUNK_HOME/share/splunk/search_mrsparkle/exposed
        """
        
        # The logic here is to first look in the full root
        # After that, we look in each directory. This is so that if somebody
        # does "<STATIC_URL>/splunkjs/mvc.js" it will be able to find it
        # under "EXPOSED_ROOT/js/splunkjs/mvc.js".
        for search_root in self.search_roots:
            abs_path = os.path.join(search_root, path)
            if os.path.exists(abs_path):
                return abs_path if not all else [abs_path]
        
        return []