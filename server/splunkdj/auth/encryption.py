import hashlib
import base64
from tlslite.utils import cipherfactory

BLOCK_SIZE = 16

class SimplerAES(object):
    def __init__(self, key):
        # First, generate a fixed-length key of 32 bytes (for AES-256)
        self._rawkey = key

    def pad (self, data):
        pad = BLOCK_SIZE - len(data) % BLOCK_SIZE
        return data + pad * chr(pad)

    def unpad (self, padded):
        pad = ord(padded[-1])
        return padded[:-pad]

    def encrypt(self, data):
        password = self._rawkey
        
        m = hashlib.md5()
        m.update(password)
        key = m.hexdigest()

        m = hashlib.md5()
        m.update(password + key)
        iv = m.hexdigest()

        data = self.pad(data)

        aes = cipherfactory.createAES(key, iv[:16])

        encrypted = str(aes.encrypt(data))
        
        return base64.urlsafe_b64encode(encrypted)

    def decrypt(self, edata):
        password = self._rawkey
        
        edata = base64.urlsafe_b64decode(edata)

        m = hashlib.md5()
        m.update(password)
        key = m.hexdigest()

        m = hashlib.md5()
        m.update(password + key)
        iv = m.hexdigest()

        aes = cipherfactory.createAES(key, iv[:16])
        return self.unpad(str(aes.decrypt(edata)))


__all__ = ['SimplerAES']