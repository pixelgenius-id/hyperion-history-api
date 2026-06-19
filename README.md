<!--suppress HtmlUnknownTarget, HtmlDeprecatedAttribute -->
<br></br>
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://eosrio.io/hyperion-white.png">
    <img alt="Hyperion Logo" src="https://eosrio.io/hyperion.png">
  </picture>
</p>

<h4 align="center">
    Scalable Full History & State Solution for the
    <a href="https://vexascan.com">Vexanium</a> blockchain
</h4>

<br>

<div align="center">

Fork of [eosrio/hyperion-history-api](https://github.com/eosrio/hyperion-history-api) — adapted for the Vexanium blockchain by [PixelGenius](https://vexascan.com)

</div>

<div align="center">

## 📖 [Hyperion Docs - Official Documentation](https://hyperion.docs.eosrio.io) 📖

</div>

---

## Vexanium-specific changes

This fork adapts the upstream Hyperion v4.0.8 for the Vexanium chain, where the system contract is `vexcore` instead of `eosio`.

**Chain adaptations**
- `system_contract: vexcore` and `eosio_alias: vexcore` in chain config
- Action module loader auto-aliases all `eosio` action handlers to `vexcore` — built-in parsers (newaccount, updateauth, voteproducer, delegatebw, etc.) work without duplication
- API routes use dynamic `system_contract` instead of hardcoded `eosio`
- Sync modules (`sync-accounts`, `sync-voters`, `sync-proposals`, `sync-permissions`) resolve `systemContract`, `tokenContract` (`vex.token`), and `msigContract` (`vex.msig`) from chain config
- `blacklists.actions: ["vexcore::onblock"]` — filters system-generated onblock actions
- `custom_core_token: VEX`

**Dependencies**
- `@pixelgeniusid/antelope@1.2.0` — fork of `@wharfkit/antelope` with VEX legacy key prefix (`VEX...`) as default in `toLegacyString()`
- `@pixelgeniusid/node-abieos` — fork of `@eosrio/node-abieos`
- `@elastic/elasticsearch@9.4.2` — upgraded for Elasticsearch 9.x server compatibility

**Indexer fixes**
- `prev_block` null check in deserializer (handles genesis block)
- `forked_blocks` handler in master
- CPU/NET accounting moved before packed_trx guard in block forEach

**Docker**
- `Dockerfile` and `docker-compose.yml` included
- Git commit hash injected at build time via `GIT_COMMIT` build arg

---

## Quick start (Docker)

```bash
# Clone
git clone https://github.com/pixelgenius-id/hyperion-history-api.git
cd hyperion-history-api

# Configure
cp config/connections.example.json config/connections.json
# Edit connections.json with your node URL, ES, RabbitMQ, Redis, MongoDB credentials
# Create config/chains/vex.config.json (see vex.config.json reference below)

# Build and start
GIT_COMMIT=$(git rev-parse HEAD) docker compose up -d

# Check health
curl http://localhost:7000/v2/health
```

### Requirements

| Service | Version |
|---------|---------|
| Node.js | >= 22 |
| Elasticsearch | 9.x |
| RabbitMQ | 4.x |
| Redis | 7.x |
| MongoDB | 7.x |

---

## vex.config.json reference

The chain config file is not committed to the repository (gitignored). Create it at `config/chains/vex.config.json`:

```json
{
  "api": {
    "enabled": true,
    "chain_name": "Vexanium",
    "server_addr": "0.0.0.0",
    "server_port": 7000,
    "stream_port": 1234,
    "server_name": "your-domain.com",
    "provider_name": "Your Provider",
    "provider_url": "https://your-domain.com",
    "chain_logo_url": "https://your-domain.com/logo.png",
    "custom_core_token": "VEX",
    "chain_api": "http://127.0.0.1:8888",
    "push_api": "http://127.0.0.1:8888",
    "enable_caching": false,
    "cache_life": 1,
    "access_log": false,
    "limits": { "get_actions": 1000, "get_voters": 100, "get_blocks": 500 }
  },
  "settings": {
    "chain": "vex",
    "system_contract": "vexcore",
    "eosio_alias": "vexcore",
    "parser": "3.2",
    "preview": false,
    "auto_mode_switch": false,
    "debug": false,
    "index_version": "v1",
    "max_ws_payload_mb": 256,
    "auto_stop": 0,
    "allow_custom_abi": false,
    "index_partition_size": 10000000,
    "es_replicas": 0,
    "bp_logs": false,
    "rate_monitoring": false,
    "ds_profiling": false
  },
  "hub": { "enabled": false, "instance_key": "" },
  "indexer": {
    "enabled": true,
    "start_on": 0,
    "stop_on": 0,
    "rewrite": false,
    "purge_queues": false,
    "live_reader": true,
    "live_only_mode": true,
    "abi_scan_mode": false,
    "fetch_block": true,
    "fetch_traces": true,
    "fetch_deltas": true,
    "disable_reading": false,
    "disable_indexing": false,
    "process_deltas": true
  },
  "scaling": {
    "polling_interval": 500,
    "resume_trigger": 5000,
    "max_queue_limit": 100000,
    "block_queue_limit": 10000,
    "routing_mode": "round_robin",
    "batch_size": 2000,
    "readers": 1,
    "ds_queues": 1,
    "ds_threads": 1,
    "ds_pool_size": 1,
    "indexing_queues": 1,
    "ad_idx_queues": 1,
    "dyn_idx_queues": 1,
    "max_autoscale": 4,
    "auto_scale_trigger": 20000
  },
  "blacklists": { "actions": ["vexcore::onblock"], "deltas": [] },
  "whitelists": { "max_depth": 0, "root_only": false, "actions": [], "deltas": [] },
  "features": {
    "streaming": { "enable": true, "traces": true, "deltas": true },
    "tables": { "proposals": true, "accounts": true, "voters": true, "permissions": true },
    "index_deltas": true,
    "index_transfer_memo": true,
    "index_all_deltas": true,
    "deferred_trx": false,
    "failed_trx": false,
    "resource_usage": false,
    "resource_limits": false,
    "contract_state": { "enabled": false, "contracts": {} }
  },
  "prefetch": { "read": 50, "block": 100, "index": 500 },
  "experimental": {},
  "plugins": {}
}
```

---

## API usage

- **v2 API** — `/v2/history/*`, `/v2/state/*`, `/v2/stats/*`
- **v1 API** — compatible with legacy `history_plugin`
- **Swagger UI** — `http://your-host:7000/docs`
- **Health check** — `http://your-host:7000/v2/health`

Full API reference: [hyperion.docs.eosrio.io/api/v2](https://hyperion.docs.eosrio.io/api/v2/)

---

## 1. Overview

Hyperion is a high-performance, scalable solution designed to index, store, and retrieve the full history and current state of Antelope-based blockchains. It addresses high-throughput data demands by providing open-source software tailored for block producers, infrastructure providers, and dApp developers.

**Key features:**
- Scalable indexing for high-throughput chains
- Full history — every action and state change captured
- Optimized flat action storage with inline action linking
- Current state indexing via MongoDB
- Modern v2 API with comprehensive endpoints
- Live streaming via WebSockets
- Extensible plugin system

## 2. Architecture

| Component | Role |
|-----------|------|
| Antelope Node (SHIP) | Source of blockchain data |
| RabbitMQ | Message queue between indexer stages |
| Redis | API caching, tx cache, rate limiting |
| Elasticsearch | Historical action and delta storage |
| MongoDB | Current state (accounts, voters, proposals) |
| Hyperion Indexer | SHIP → deserialize → RabbitMQ → ES/MongoDB |
| Hyperion API | Fastify HTTP server serving v1/v2 endpoints |

## 3. License

Hyperion History API is licensed under [CC BY-NC-SA 4.0](https://github.com/eosrio/hyperion-history-api/blob/main/license.md) by [EOS Rio](https://eosrio.io). This fork maintains the same license.

Original: [eosrio/hyperion-history-api](https://github.com/eosrio/hyperion-history-api) — Made with ♥ by [Rio Blocks](https://rioblocks.io)
