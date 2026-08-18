#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Collect subscription quota data from various AI services.

Outputs:
  - D:/Obsidian Vault/Obsidian Vault/.smart-dashboard/subscriptions.json (quota data)
  - D:/Obsidian Vault/Obsidian Vault/.smart-dashboard/subscriptions_config.json (encrypted credentials)

Currently supported:
  - OpenCode Go: GET https://opencode.ai/zen/go/v1/usage
  - Zhipu GLM: Cookie-based
  - Volcengine: API Key-based
"""

import base64
import hashlib
import json
import os
import platform
import sys
import time
import urllib.request
import urllib.error

# ------------------------------------------------------------------ config
VAULT_DASHBOARD = r"D:/Obsidian Vault/Obsidian Vault/.smart-dashboard"
OUT_JSON = os.path.join(VAULT_DASHBOARD, "subscriptions.json")
CONFIG_JSON = os.path.join(VAULT_DASHBOARD, "subscriptions_config.json")
KEY_FILE = os.path.join(VAULT_DASHBOARD, ".secret_key")

# API endpoints
OPENCODE_USAGE_URL = "https://opencode.ai/zen/go/v1/usage"
ZHIPU_QUOTA_URL = "https://open.bigmodel.cn/api/monitor/usage/quota/limit"
VOLCENGINE_USAGE_URL = "https://ark.cn-beijing.volces.com/api/v3/usage"  # Placeholder

# ------------------------------------------------------------------ encryption
def get_or_create_key() -> bytes:
    """Get or create encryption key based on machine特征."""
    if os.path.exists(KEY_FILE):
        with open(KEY_FILE, "rb") as f:
            return f.read()
    
    # Generate key from machine特征
    machine_id = f"{platform.node()}-{platform.machine()}-{os.getlogin()}"
    key_seed = hashlib.sha256(machine_id.encode()).digest()
    
    # Use Fernet-compatible key (32 bytes base64)
    key = base64.urlsafe_b64encode(key_seed)
    
    with open(KEY_FILE, "wb") as f:
        f.write(key)
    
    # Set restrictive permissions (Windows: owner only)
    try:
        os.chmod(KEY_FILE, 0o600)
    except:
        pass
    
    return key


def encrypt_value(value: str) -> str:
    """Simple XOR encryption with base64 encoding."""
    if not value:
        return ""
    
    key = get_or_create_key()
    # Simple XOR (for basic obfuscation, not cryptographic security)
    encrypted = bytes([b ^ key[i % len(key)] for i, b in enumerate(value.encode())])
    return base64.urlsafe_b64encode(encrypted).decode()


def decrypt_value(encrypted: str) -> str:
    """Simple XOR decryption."""
    if not encrypted:
        return ""
    
    key = get_or_create_key()
    decoded = base64.urlsafe_b64decode(encrypted)
    decrypted = bytes([b ^ key[i % len(key)] for i, b in enumerate(decoded)])
    return decrypted.decode()


# ------------------------------------------------------------------ config management
def load_config() -> dict:
    """Load subscription configuration."""
    if os.path.exists(CONFIG_JSON):
        try:
            with open(CONFIG_JSON, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {"providers": {}}


def save_config(config: dict):
    """Save subscription configuration."""
    os.makedirs(VAULT_DASHBOARD, exist_ok=True)
    with open(CONFIG_JSON, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def add_provider_config(provider_id: str, credentials: dict):
    """Add or update provider configuration with encrypted credentials."""
    config = load_config()
    
    # Encrypt sensitive fields
    encrypted_creds = {}
    for key, value in credentials.items():
        if isinstance(value, str) and value:
            encrypted_creds[key] = encrypt_value(value)
        else:
            encrypted_creds[key] = value
    
    config["providers"][provider_id] = {
        "enabled": True,
        "credentials": encrypted_creds,
        "added_at": time.strftime("%Y-%m-%dT%H:%M:%S")
    }
    
    save_config(config)
    return config


def remove_provider_config(provider_id: str):
    """Remove provider configuration."""
    config = load_config()
    if provider_id in config.get("providers", {}):
        del config["providers"][provider_id]
        save_config(config)
    return config


def get_provider_credential(provider_id: str, cred_key: str) -> str:
    """Get decrypted credential for a provider."""
    config = load_config()
    provider = config.get("providers", {}).get(provider_id, {})
    creds = provider.get("credentials", {})
    encrypted = creds.get(cred_key, "")
    return decrypt_value(encrypted) if encrypted else ""


# ------------------------------------------------------------------ API fetchers
def fetch_opencode_go(api_key: str) -> dict | None:
    """Fetch OpenCode Go subscription quota."""
    if not api_key:
        print("WARN: OpenCode Go API key not provided", flush=True)
        return None
    
    try:
        req = urllib.request.Request(
            OPENCODE_USAGE_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "User-Agent": "smart-dashboard/1.0"
            }
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        
        usage = data.get("usage", {})
        return {
            "provider": "opencode-go",
            "name": "OpenCode Go",
            "icon": "🤖",
            "type": "api",
            "windows": {
                window: {
                    "percent": usage.get(window, {}).get("percent", 0),
                    "resetsAt": usage.get(window, {}).get("resetsAt", ""),
                    "status": usage.get(window, {}).get("status", "unknown")
                }
                for window in ["rolling", "weekly", "monthly"]
                if window in usage
            },
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S")
        }
    except Exception as e:
        print(f"WARN: OpenCode Go fetch failed: {e}", flush=True)
        return None


def fetch_zhipu_glm(cookie: str) -> dict | None:
    """Fetch Zhipu GLM quota."""
    if not cookie:
        print("WARN: Zhipu GLM cookie not provided", flush=True)
        return None
    
    try:
        req = urllib.request.Request(
            ZHIPU_QUOTA_URL,
            headers={
                "Cookie": cookie,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        
        if data.get("code") != 200:
            print(f"WARN: Zhipu API error: {data.get('msg', 'unknown')}", flush=True)
            return None
        
        limits = data.get("data", {}).get("limits", [])
        windows = {}
        
        for limit in limits:
            limit_type = limit.get("type", "")
            percentage = limit.get("percentage", 0)
            reset_time = limit.get("nextResetTime", 0)
            
            # Convert timestamp to ISO string
            resets_at = ""
            if reset_time:
                resets_at = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(reset_time / 1000))
            
            if limit_type == "TIME_LIMIT":
                windows["rolling"] = {"percent": percentage, "resetsAt": resets_at}
            elif limit_type == "TOKENS_LIMIT":
                windows["monthly"] = {"percent": percentage, "resetsAt": resets_at}
        
        return {
            "provider": "zhipu-glm",
            "name": "智谱 GLM",
            "icon": "🔍",
            "type": "api",
            "windows": windows,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S")
        }
    except Exception as e:
        print(f"WARN: Zhipu GLM fetch failed: {e}", flush=True)
        return None


def fetch_volcengine(api_key: str) -> dict | None:
    """Fetch Volcengine quota (placeholder)."""
    # TODO: Implement when Volcengine API is available
    print("INFO: Volcengine fetch not yet implemented", flush=True)
    return None


# ------------------------------------------------------------------ data management
def load_existing_quotes() -> dict:
    """Load existing quota data."""
    if os.path.exists(OUT_JSON):
        try:
            with open(OUT_JSON, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and "providers" in data:
                return data
        except:
            pass
    return {"version": 1, "providers": []}


def merge_providers(existing: dict, new_provider: dict) -> dict:
    """Merge new provider data into existing providers list."""
    providers = existing.get("providers", [])
    
    # Find existing provider by id
    found = False
    for i, p in enumerate(providers):
        if p.get("provider") == new_provider.get("provider"):
            providers[i] = new_provider
            found = True
            break
    
    if not found:
        providers.append(new_provider)
    
    existing["providers"] = providers
    return existing


def remove_provider(provider_id: str):
    """Remove a provider from subscriptions.json."""
    data = load_existing_quotes()
    data["providers"] = [p for p in data.get("providers", []) if p.get("provider") != provider_id]
    data["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    
    os.makedirs(VAULT_DASHBOARD, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ------------------------------------------------------------------ main
def main():
    quiet = "--quiet" in sys.argv
    action = sys.argv[1] if len(sys.argv) > 1 else "collect"
    
    # Handle actions
    if action == "add":
        # Add provider: python collect_subscriptions.py add <provider_id> <key> <value>
        if len(sys.argv) >= 5:
            provider_id = sys.argv[2]
            key = sys.argv[3]
            value = sys.argv[4]
            add_provider_config(provider_id, {key: value})
            print(f"Added {provider_id} credential: {key}", flush=True)
        return
    
    if action == "remove":
        # Remove provider: python collect_subscriptions.py remove <provider_id>
        if len(sys.argv) >= 3:
            provider_id = sys.argv[2]
            remove_provider_config(provider_id)
            remove_provider(provider_id)
            print(f"Removed {provider_id}", flush=True)
        return
    
    if action == "list":
        # List configured providers
        config = load_config()
        for pid, pdata in config.get("providers", {}).items():
            status = "✅" if pdata.get("enabled") else "❌"
            print(f"{status} {pid}", flush=True)
        return
    
    # Default action: collect quotas
    data = load_existing_quotes()
    
    # Get enabled providers from config
    config = load_config()
    providers_config = config.get("providers", {})
    
    # Fetch OpenCode Go (always try — auto-detect from auth.json if no config)
    api_key = get_provider_credential("opencode-go", "apiKey")
    if not api_key:
        # Auto-detect from auth.json
        auth_file = os.path.expanduser("~/.local/share/opencode/auth.json")
        if os.path.exists(auth_file):
            try:
                with open(auth_file, "r") as f:
                    auth = json.load(f)
                api_key = auth.get("opencode-go", {}).get("key", "")
            except:
                pass
    
    if api_key:
        result = fetch_opencode_go(api_key)
        if result:
            data = merge_providers(data, result)
            if not quiet:
                print(f"OpenCode Go: rolling={result['windows'].get('rolling', {}).get('percent', '?')}%", flush=True)
    
    # Fetch Zhipu GLM
    if providers_config.get("zhipu-glm", {}).get("enabled"):
        cookie = get_provider_credential("zhipu-glm", "cookie")
        if cookie:
            result = fetch_zhipu_glm(cookie)
            if result:
                data = merge_providers(data, result)
                if not quiet:
                    print(f"Zhipu GLM: rolling={result['windows'].get('rolling', {}).get('percent', '?')}%", flush=True)
    
    # Fetch Volcengine
    if providers_config.get("volcengine", {}).get("enabled"):
        api_key = get_provider_credential("volcengine", "apiKey")
        if api_key:
            result = fetch_volcengine(api_key)
            if result:
                data = merge_providers(data, result)
    
    # Update timestamp and save
    data["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    
    os.makedirs(VAULT_DASHBOARD, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    if quiet:
        return
    
    # Summary
    providers = data.get("providers", [])
    print(f"\nProviders: {len(providers)}", flush=True)
    for p in providers:
        name = p.get("name", p.get("provider", "unknown"))
        windows = p.get("windows", {})
        rolling = windows.get("rolling", {}).get("percent", "?")
        print(f"  {p.get('icon', '📦')} {name}: rolling={rolling}%", flush=True)
    print("written:", OUT_JSON, flush=True)


if __name__ == "__main__":
    main()
