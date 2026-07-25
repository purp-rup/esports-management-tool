"""
Encryption utilities for securing sensitive data
Encrypts Discord tokens before storing in database
"""

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
import os
import base64
from dotenv import load_dotenv

load_dotenv()

# Get encryption key from environment variable
# This should be a 32-byte URL-safe base64-encoded key
MASTER_SECRET = os.getenv('MASTER_ENCRYPTION_SECRET', '').encode()

def _get_user_key(user_id: int) -> Fernet:
    if not MASTER_SECRET:
        raise ValueError("MASTER_ENCRYPTION_SECRET not found in environment variables.")
    salt = f"user:{user_id}:discord".encode()
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=b'esports_discord_encryption',
    )
    key = base64.urlsafe_b64encode(hkdf.derive(MASTER_SECRET))
    return Fernet(key)

def encrypt_token(token: str, user_id: int) -> str:
    """
    Encrypt a token for secure storage
    
    Args:
        token (str): Plain text token to encrypt
    
    Returns:
        bytes: Encrypted token as bytes (can be stored in BLOB column)
    """
    if not token:
        return None
    
    try:
        f = _get_user_key(user_id)
        return f.encrypt(token.encode()).decode('utf-8') # Return bytes directly for BLOB storage
    except Exception as e:
        print(f"Error encrypting token: {str(e)}")
        import traceback; traceback.print_exc()
        return None

def decrypt_token(encrypted_token, user_id: int) -> str:
    """
    Decrypt a token from storage
    
    Args:
        encrypted_token (bytes or str): Encrypted token from database
    
    Returns:
        str: Decrypted plain text token
    """
    if not encrypted_token:
        return None
    
    try:
        f = _get_user_key(user_id)
        
        # Handle both bytes and string inputs
        if isinstance(encrypted_token, str):
            encrypted_token = encrypted_token.encode()
        
        return f.decrypt(encrypted_token).decode('utf-8')
    except Exception as e:
        print(f"Error decrypting token: {str(e)}")
        print(f"Token type: {type(encrypted_token)}")
        print(f"Token value (first 50 chars): {str(encrypted_token)[:50]}")
        import traceback; traceback.print_exc()
        return None
