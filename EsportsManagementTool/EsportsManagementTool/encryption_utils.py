"""
Encryption utilities for securing sensitive data
Encrypts Discord tokens before storing in database
"""

from cryptography.fernet import Fernet
import os
from dotenv import load_dotenv

load_dotenv()

# Get encryption key from environment variable
# This should be a 32-byte URL-safe base64-encoded key
ENCRYPTION_KEY = os.getenv('ENCRYPTION_KEY')

def get_cipher():
    """
    Get Fernet cipher instance for encryption/decryption
    """
    if not ENCRYPTION_KEY:
        raise ValueError(
            "ENCRYPTION_KEY not found in environment variables. "
            "Generate one using generate_encryption_key() and add it to .env"
        )
    
    return Fernet(ENCRYPTION_KEY.encode())

def encrypt_token(token):
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
        cipher = get_cipher()
        encrypted = cipher.encrypt(token.encode())
        return encrypted  # Return bytes directly for BLOB storage
    except Exception as e:
        print(f"Error encrypting token: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def decrypt_token(encrypted_token):
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
        cipher = get_cipher()
        
        # Handle both bytes and string inputs
        if isinstance(encrypted_token, str):
            encrypted_token = encrypted_token.encode()
        
        decrypted = cipher.decrypt(encrypted_token)
        return decrypted.decode()
    except Exception as e:
        print(f"Error decrypting token: {str(e)}")
        print(f"Token type: {type(encrypted_token)}")
        print(f"Token value (first 50 chars): {str(encrypted_token)[:50]}")
        import traceback
        traceback.print_exc()
        return None
