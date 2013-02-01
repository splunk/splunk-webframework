import atexit
import subprocess
import json
import sys
import os
import socket
import shutil
import zipfile
from os import path
from time import sleep
from getpass import getpass

MAIN_DIR = path.abspath(path.join(path.dirname(__file__), ".."))
HAS_LINK = hasattr(os, 'symlink')

APPFX_APPSERVER_DEFAULT_PORT = 8080
APPFX_PROXY_DEFAULT_PORT = 3000
APPFX_PROXY_DEFAULT_PATH = "/api"
DEFAULT_APPFX_CONFIG_FILE = ".appfxrc"
SPLUNK_HOME_FILE = ".splunkhome"
APPFX_DEFAULT_APPS = ["quickstartfx", "homefx", "examplesfx", "componentfx", "testfx"]

try:
    import envoy
    from envoy import expand_args, ConnectedCommand
    import argh
    from argh import arg, ArghParser
except:
    os.unlink(path.join(MAIN_DIR, SPLUNK_HOME_FILE))
    print "You provided a bad SPLUNK_HOME ('%s'). Please run 'appfx setup' again." % os.environ['SPLUNK_HOME']
    sys.exit(1)

# We create a demo args object that we can fill
class Args(object):
    def __init__(self, *args, **kwargs):
        for key, value in kwargs.iteritems():
            setattr(self, key, value)

def is_port_open(ip, port):    
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:        
        s.connect((ip, int(port)))
        s.shutdown(2)
        s.close()
        return True
    except Exception, e:
        return False

def generate_random_key():
    from django.utils.crypto import get_random_string
    chars = 'abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*(-_=+)'
    secret_key = get_random_string(50, chars)
    
    return secret_key

def check_splunk():    
    setup_django_environment()
    
    from django.conf import settings
    from splunklib.client import Service
    
    host = settings.SPLUNKD_HOST
    port = settings.SPLUNKD_PORT
    service = Service(
        token="unnecessary_token",
        host=host,
        port=port
    )
    
    version = [0]
    try:   
        info = service.info()
        version = map(int, info.version.split("."))
    except Exception as e:
        print "Could not connect to Splunk at %s:%s" % (host, port)
        sys.exit(1)
        
    # Make sure it is greater than Splunk 5.0, or an internal build
    if (version[0] < 5 and not version[0] > 1000):
        print "You have Splunk %s, but Splunk AppFx requires Splunk 5.0 or later" % info.version
        sys.exit(1)

def setup_django_environment():
    try:
        sys.path.append(path.join(MAIN_DIR, "server"));
        server_py = path.join(MAIN_DIR, "server", "manage.py")
        
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings")
        from django.conf import settings
        settings.SPLUNKD_PORT
    except Exception, e:
        print "There was an error setting up the Django environment:"
        print e
        sys.exit(1)
    
def run_django_command(command, args):
    try:
        sys.path.append(path.join(MAIN_DIR, "server"));
        server_py = path.join(MAIN_DIR, "server", "manage.py")
        
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings")
        
        # Prepare argv
        argv = list(args)
        argv.insert(0, command)        
        argv.insert(0, server_py)
        
        from django.core.management import ManagementUtility
        commander = ManagementUtility(argv)
        commander.execute()
    except:
        print "There was an error running a the '%s' command with '%s'" % (command, args)
        sys.exit(1)
        
    return
    
def connect(argv, data=None, env=None, cwd=None, stdout=None, stderr=None):
    """Spawns a new process from the given args."""

    environ = dict(os.environ)
    environ.update(env or {})

    process = subprocess.Popen(
        argv,
        universal_newlines=True,
        shell=False,
        env=environ,
        stdin=subprocess.PIPE,
        stdout=stdout or subprocess.PIPE,
        stderr=stderr or subprocess.PIPE,
        bufsize=0,
        cwd=cwd,
    )

    return ConnectedCommand(process=process)
    
def start_django(config):    
    server_py = path.join(MAIN_DIR, "server", "manage.py")
    argv = [config['python'], server_py, "runwsgiserver", "autoreload=true"]
    connected = connect(argv, stdout=sys.stdout, stderr=sys.stderr)
    
    def cleanup():
        try:
            connected.kill()
        except:
            pass
    atexit.register(cleanup)
    
    return connected
    
def start_proxy(config):
    proxy_js = path.join(MAIN_DIR, "proxy", "proxy.js")
    connected = connect(
        [config['node'], proxy_js], 
        stdout=sys.stdout, 
        stderr=sys.stderr)
    
    def cleanup():
        try:
            connected.kill()
        except:
            pass
    atexit.register(cleanup)
    
    return connected

def setup_environment(configfile):
    config_file = path.join(MAIN_DIR, configfile)
    
    if not path.exists(config_file):
        print "Configuration file '%s' does not exist, please run 'appfx setup'" % config_file
        sys.exit(1)
    
    config = None
    try:
        config = json.load(open(config_file, 'r'))
    except:
        print "There was an error while parsing of '%s', please run 'appfx setup'" % config_file
        sys.exit(1)
    
    os.environ['APPFX_CONFIG'] = config_file
        
    return config
    
def try_import(libs):
    imports = 0
    for lib in libs:
        try:
            __import__(lib)
            imports += 1
        except:
            pass
    
    return imports > 0

def grepsingle(txt, pattern):
    lines = txt.split("\n")
    for line in lines:
        line = line.strip()
        if line.startswith(pattern):
            return line
        
# When we install a new app, we need a way to refresh the conf files
# so that everything is picked up
def refresh_apps(username, password, config):
    from splunklib.client import connect
    
    try:
        service = connect(
            host=str(config["splunkd_host"]),
            port=int(config["splunkd_port"]),
            username=username,
            password=password)
            
        service.post("/services/apps/local/_reload") 
    except Exception, e:
        if hasattr(e, 'status') and e.status == 401:
            print "The Splunk credentials you provided were invalid. Please try again."
            sys.exit(1)
        else:
            raise

@arg('--force', default=False, help='Force overwriting the /etc/apps/{name} directory (only on Windows).')
@arg('--file', default=DEFAULT_APPFX_CONFIG_FILE, help='The configuration file to read from.')
@arg('--username', help='Splunk username to deploy with.')
@arg('--password', help='Splunk password to deploy with.')
@arg('appname', help='Name of app to deploy.')
def deploy(args):    
    """Deploy (or redeploy) an application"""
    
    try:        
        config = setup_environment(args.file)
        app_path = path.join(MAIN_DIR, "server", "apps", args.appname)
        splunk_app_path = path.join(os.environ['SPLUNK_HOME'], "etc", "apps", args.appname)
        
        while not args.username or not args.password:
            args.username = raw_input("Splunk Username: ")
            args.password = getpass("Splunk Password: ") 
            
        # We try a refresh initially to make sure we have good enough credentials
        # to perform this operation
        refresh_apps(args.username, args.password, config)
        
        if not path.exists(app_path):
            print "An AppFx app with name '%s' doesn't exist. Please use the name of an actual app." % args.appname
            sys.exit(1)
            
        if path.exists(splunk_app_path) and HAS_LINK:
            os.unlink(splunk_app_path)            
            
        if not path.exists(splunk_app_path):
            if HAS_LINK:
                os.symlink(path.join(app_path, "splunkd"), splunk_app_path)
            else:
                shutil.copytree(path.join(app_path, "splunkd"), splunk_app_path)
        else:
            # If the user tells us to "force" redeployment and we don't have symlinks,
            # then we have to delete the copied over folder and write a new one
            if not HAS_LINK and args.force:
                shutil.rmtree(splunk_app_path)
                shutil.copytree(path.join(app_path, "splunkd"), splunk_app_path)
            elif not HAS_LINK and not args.force:
                print "An app directory '%s' already exists in etc/apps. Please use --force to overwrite it." % args.appname
                sys.exit(1)

        # Make sure splunkd is aware about this newly deployed app
        refresh_apps(args.username, args.password, config)

        print "The app '%s' was deployed" % args.appname
    except KeyboardInterrupt:
        pass
    

@arg('--file', default=DEFAULT_APPFX_CONFIG_FILE, help='The configuration file to read from.')
@arg('--username', help='Splunk username to deploy with.')
@arg('--password', help='Splunk password to deploy with.')
@arg('appname', help='Name of app to delete.')
def removeapp(args):    
    """Remove an application from AppFx"""
    
    try:            
        config = setup_environment(args.file)
        app_path = path.join(MAIN_DIR, "server", "apps", args.appname)
        splunk_app_path = path.join(os.environ['SPLUNK_HOME'], "etc", "apps", args.appname)
        
        if not path.exists(app_path):
            print "An AppFx app with name '%s' doesn't exist. Please use the name of an actual app." % args.appname
            sys.exit(1)
            
        if not path.exists(splunk_app_path):
            print "A Splunk app with name '%s' doesn't exist. Please use the name of an actual app." % args.appname
            sys.exit(1)
    except KeyboardInterrupt:
        pass
        
    try:
        while not args.username or not args.password:
            args.username = raw_input("Splunk Username: ")
            args.password = getpass("Splunk Password: ")  
            
        # We try a refresh initially to make sure we have good enough credentials
        # to perform this operation
        refresh_apps(args.username, args.password, config)
            
        # We have to unlink first
        if path.exists(splunk_app_path):
            os.unlink(splunk_app_path) if HAS_LINK else shutil.rmtree(splunk_app_path)
        if path.exists(app_path):
           shutil.rmtree(app_path)
           
        # Make sure splunkd picks up that this app is done for
        refresh_apps(args.username, args.password, config)
        
        print "The app '%s' was removed." % args.appname
    except:
        print "An error occurred while deleting app '%s', please try again." % args.appname

@arg('--file', default=DEFAULT_APPFX_CONFIG_FILE, help='The configuration file to read from.')
@arg('--username', help='Splunk username to deploy with.')
@arg('--password', help='Splunk password to deploy with.')
@arg('appname', help='Name of app to create.')
def createapp(args):
    """Create an application on AppFx"""
    
    try:
        while not args.username or not args.password:
            args.username = raw_input("Splunk Username: ")
            args.password = getpass("Splunk Password: ")  
            
        config = setup_environment(args.file)
        app_path = path.join(MAIN_DIR, "server", "apps", args.appname)
        splunk_app_path = path.join(os.environ['SPLUNK_HOME'], "etc", "apps", args.appname)
        
        if path.exists(app_path):
            print "An AppFx app with name '%s' already exists. Please use a different name." % args.appname
            sys.exit(1)
            
        if path.exists(splunk_app_path):
            print "A Splunk app with name '%s' already exists. Please use a different name." % args.appname
            sys.exit(1)
    except KeyboardInterrupt:
        pass
        
    try:        
        os.mkdir(app_path)
        
        template_path = path.join(MAIN_DIR, "server", "appfx", "app_templates", "basic")
        template = "--template=%s" % template_path
        extensions = "--extension=py,xml,conf,tmpl"
        
        # NOTE: THIS MUST BE THE LAST EXTENSION!!
        # We depend on this to put the mount in the 
        # redirect.tmpl file in splunkd/appserver/templates
        mount = "--extension=%s" % config['mount']
        
        # We try a refresh initially to make sure we have good enough credentials
        # to perform this operation
        refresh_apps(args.username, args.password, config)
        
        run_django_command("startapp", [template, extensions, mount, args.appname, app_path])
        
        if HAS_LINK:
            os.symlink(path.join(app_path, "splunkd"), splunk_app_path)
        else:
            shutil.copytree(path.join(app_path, "splunkd"), splunk_app_path)
        
        # Make sure splunkd is aware about this new app
        refresh_apps(args.username, args.password, config)
        
        print "The app '%s' was created at '%s'" % (args.appname, app_path)
    except KeyboardInterrupt:
        if path.exists(app_path):
            shutil.rmtree(app_path)
        if path.exists(splunk_app_path):
            if HAS_LINK:
                os.unlink(splunk_app_path)
            else:
                shutil.rmtree(splunk_app_path)
        
        pass
    except:
        if path.exists(app_path):
            shutil.rmtree(app_path)
        if path.exists(splunk_app_path) or path.lexists(splunk_app_path):
            if HAS_LINK:
                os.unlink(splunk_app_path)
            else:
                shutil.rmtree(splunk_app_path)
        raise
        
    return

@arg('appnames', help='Apps to run tests for.', nargs="*")
@arg('--noinput', default=True, help='Tells Django to NOT prompt the user for input of any kind.')
@arg('--failfast', default=True, help='Tells Django to stop running the test suite after first failed test.')
@arg('--testrunner', help='Tells Django to use specified test runner class instead of the one specified by the TEST_RUNNER setting.')
@arg('--liveserver', default=None, help='Overrides the default address where the live server (used with LiveServerTestCase) is expected to run from. The default value is localhost:8081.')
@arg('--file', default=DEFAULT_APPFX_CONFIG_FILE, help='The configuration file to read from.')
@arg('--username', help='Splunk username to run tests with.')
@arg('--password', help='Splunk password to run tests with.')
def test(args):
    """Runs the test suite for the specified applications, 
    or the entire site if no apps are specified."""
    
    appnames = " ".join(args.appnames)
    noinput = "--noinput" if args.noinput else ""
    failfast = "--failfast" if args.failfast else ""
    testrunner = "--testrunner=%s" % (args.testrunner) if args.testrunner else ""
    liveserver = "--liveserver=%s" % (args.liveserver) if args.liveserver else ""
    
    try:
        config = setup_environment(args.file)
        
        os.environ['TEST_MODE'] = "1"
        
        python = os.environ.get("PYTHON_HOME", None)
        if not python:
            print "Cannot run tests as there is no system Python available."
            sys.exit(1)
        
        # The tests require a sqlite driver, so we have to append
        # the regular PYTHONPATH paths, otherwise we won't find it. It could be 
        # that we still won't find it, in which case we will just fail
        # with a useful error message
        path_info = envoy.run('%s -c "import json; import sys; print json.dumps(sys.path)"' % python)
        paths = json.loads(path_info.std_out or "[]")
        sys.path += paths
        
        # Store username and password if provided
        if args.username:
            os.environ['SPLUNK_TEST_USERNAME'] = args.username
        
        if args.password:
            os.environ['SPLUNK_TEST_PASSWORD'] = args.password
        
        # Try and import pysqlite2 or sqlite3. If both fail, then we stop
        if not try_import(['pysqlite2', 'sqlite3']):
            print "AppFx couldn't import pysqlite2 or sqlite3, which are required for running tests."
            sys.exit(1)
        
        args = filter(lambda x: len(x), [noinput, failfast, testrunner, liveserver, "--traceback", appnames])
        run_django_command("test", args)
    except KeyboardInterrupt:
        pass
    
    return
    
@arg('--file', default=DEFAULT_APPFX_CONFIG_FILE, help='Config file to write to')
def run(args):
    """Setup a new AppFx instance"""
    
    try:
        config = setup_environment(args.file)
        
        check_splunk()
        
        proxy = start_proxy(config)
        django = start_django(config)
        
        sleep(2)
        print "AppFx is running now -- browse to http://localhost:%s/%s" % (config['proxy_port'], config['mount'])
        
        django.block()
    except KeyboardInterrupt:
        pass

@arg('--file', default=DEFAULT_APPFX_CONFIG_FILE, help='Config file to delete')
def clean(args):
    """Delete settings and configuration"""
    try:
        os.remove(args.file)
        os.remove(SPLUNK_HOME_FILE)
    except:
        print
        pass
        
    return

@arg('--file', default=DEFAULT_APPFX_CONFIG_FILE, help='Config file to write to')
def setup(args):
    """Setup a new AppFx instance"""
        
    print "\nSetting up Splunk AppFx..."
    try:
        splunk_home = os.environ.get("SPLUNK_HOME", "")
        
        splunkd_port         = None
        splunkweb_port       = None
        splunkd_host         = None
        splunkweb_host       = None
        appfx_mount          = None
        appfx_appserver_port = None
        appfx_proxy_port     = None
        appfx_proxy_path     = None
        
        while True:
            version_info = envoy.run([['%s/bin/splunk' % splunk_home, 'version']])
            version = version_info.std_out.strip()
            if not (version.startswith("Splunk 5") or version.startswith("Splunk 6") or version.startswith("Splunk 201")):
                os.remove(path.join(MAIN_DIR, ".splunkhome"))
                print "Version must be >= 'Splunk 5.0', found '%s' in '%s', please run 'appfx setup' again" % (version, splunk_home)
                sys.exit(1)

            is_win32 = sys.platform == "win32"

            # Get Python, Node and Splunk paths
            splunk_path = path.join(splunk_home, "bin", "splunk" + (".exe" if is_win32 else ""))
            python_path = path.join(splunk_home, "bin", "python" + (".exe" if is_win32 else ""))
            node_path = path.join(splunk_home, "bin", "node" + (".exe" if is_win32 else ""))
                
            python_exists = path.exists(python_path.strip())
            node_exists = path.exists(node_path)

            # Ensure Python and Node exist
            if not python_exists:
                print "No Python interpreter, exiting..."
                sys.exit(1)
                
            if not node_exists:
                print "No Node.js interpreter, exiting..."
                sys.exit(1)
        
            # Get Various information from Splunk
            if not splunkd_port:
                exec_out = envoy.run([["%s" % splunk_path, "btool", "web", "list", "settings"]])
                std_out = grepsingle(exec_out.std_out, "mgmtHostPort")
                splunkd_port = std_out.strip()
                splunkd_port = splunkd_port[splunkd_port.rfind(":") + 1:]
            
            if not splunkweb_port:
                exec_out = envoy.run([["%s" % splunk_path, "btool", "web", "list", "settings"]])
                std_out = grepsingle(exec_out.std_out, "httpport")
                splunkweb_port = std_out.strip()
                splunkweb_port = splunkweb_port[splunkweb_port.rfind("=") + 1:].strip()
            
            splunkd_host = splunkd_host or "localhost"
            splunkweb_host = splunkweb_host or "localhost"
            appfx_mount = appfx_mount or "appfx"
            appfx_appserver_port = appfx_appserver_port or APPFX_APPSERVER_DEFAULT_PORT
            appfx_proxy_port = appfx_proxy_port or APPFX_PROXY_DEFAULT_PORT
            appfx_proxy_path = appfx_proxy_path or APPFX_PROXY_DEFAULT_PATH
        
            print "\nSplunk AppFx will use the following values:"
            print " - Splunkd Host: %s" % splunkd_host
            print " - Splunkd Port: %s" % splunkd_port
            print " - Splunkweb Host: %s" % splunkweb_host
            print " - Splunkweb Port: %s" % splunkweb_port
            print " - AppFx AppServer Port: %s" % appfx_appserver_port
            print " - AppFx Proxy Port: %s" % appfx_proxy_port
            print " - AppFx Proxy Path: %s" % appfx_proxy_path
            print " - AppFx Mount: %s" % appfx_mount
            print " - Splunk installation (SPLUNK_HOME): %s" % splunk_home
            
            if argh.helpers.confirm("\nAre these values correct ('Y' to accept, 'n' to edit)", default=True):
                break
            
            splunkd_host = raw_input("Splunkd Host [%s]: " % (splunkd_host)) or splunkd_host
            splunkd_port = raw_input("Splunkd port [%s]: " % (splunkd_port)) or splunkd_port
            
            splunkweb_host = raw_input("Splunkweb host [%s]: " % (splunkweb_host)) or splunkweb_host
            splunkweb_port = raw_input("Splunkweb port [%s]: " % (splunkweb_port)) or splunkweb_port
            
            # Get information about AppFx ports
            appfx_appserver_port = raw_input("AppFx appserver port [%s]: " % (appfx_appserver_port)) or appfx_appserver_port
            while is_port_open("localhost", appfx_appserver_port):
                if argh.helpers.confirm("AppFx appserver port '%s' is taken. Would you like to change it" % appfx_appserver_port, default=True):
                    appfx_appserver_port = raw_input("AppFx appserver port [%s]: " % (appfx_appserver_port)) or appfx_appserver_port
                else:
                    sys.exit(1)
            
            appfx_proxy_port = raw_input("AppFx proxy port [%s]: " % (appfx_proxy_port)) or appfx_proxy_port
            while is_port_open("localhost", appfx_proxy_port):
                if argh.helpers.confirm("AppFx proxy port '%s' is taken. Would you like to change it" % appfx_proxy_port, default=True):
                    appfx_proxy_port = raw_input("AppFx proxy port [%s]: " % (appfx_proxy_port)) or appfx_proxy_port
                else:
                    sys.exit(1)
        
            appfx_proxy_path = raw_input("AppFx Proxy Path [%s]: " % appfx_proxy_path) or appfx_proxy_path
        
            appfx_mount = raw_input("AppFx Mount [%s]: " % appfx_mount) or appfx_mount
            
            splunk_home = raw_input("Splunk Installation (SPLUNK_HOME) [%s]: " % splunk_home) or splunk_home
            splunk_home = path.expanduser(splunk_home)
            
            # Write out SPLUNK_HOME
            dot_splunkhome = open(path.join(MAIN_DIR, '.splunkhome'), 'w')
            dot_splunkhome.write(splunk_home)
            dot_splunkhome.flush()
                
        
        # Extract Django
        print "\nInstalling Django..."
        django_folder_path = path.join(MAIN_DIR, "contrib", "django")
        django_egg_path = path.join(MAIN_DIR, "contrib", "django.egg")
        if path.exists(django_folder_path):
           shutil.rmtree(django_folder_path)
           
        zipfile.ZipFile(django_egg_path).extractall(django_folder_path)
        
        # Generate secret key
        print "\nGenerating secret key..."        
        secret_key = generate_random_key()
        
        # Serialize configuration
        config = {
            "splunkd_host": splunkd_host,
            "splunkd_port": int(splunkd_port),
            "splunkweb_host": splunkweb_host,
            "splunkweb_port": int(splunkweb_port),
            "mount": appfx_mount,
            "appfx_port": int(appfx_appserver_port),
            "proxy_port": int(appfx_proxy_port),
            "proxy_path": appfx_proxy_path,
            "secret_key": secret_key,
            "debug": True,
            "python": python_path,
            "node": node_path,
            "quickstart": True
        }
        
        json.dump(config, open(path.join(MAIN_DIR, args.file), 'w'), sort_keys=True, indent=4)
        
        print "\nInstalling default apps..."
        while True:
            username = raw_input("Splunk Username: ")
            password = getpass("Splunk Password: ")
            
            if not username or not password:
                continue
                
            args = Args(
                file=DEFAULT_APPFX_CONFIG_FILE,
                appname="",
                force=True,
                username=username,
                password=password,
            )
            for app in APPFX_DEFAULT_APPS:
                args.appname = app
                deploy(args)
            
            break
        
    except KeyboardInterrupt:
        print
        sys.exit(0)
        
    print "\nSplunk AppFx setup is complete -- enter 'appfx run' to start"

parser = ArghParser()
parser.add_commands([setup, run, test, clean, createapp, removeapp, deploy])

if __name__=='__main__':
    parser.dispatch()
