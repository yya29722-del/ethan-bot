# EthanBot

Ethan plays Stardew Valley alongside yaya as a real autonomous player.

## Architecture

| Component | What it does |
|-----------|-------------|
| **EthanBot** (this mod) | Spawns Ethan as an NPC companion that follows yaya |
| **NagiBridge** (auto-installed) | Exposes HTTP API so Claude can control the game |
| **ethan_agent.py** | Claude runs as Ethan, reads game state, executes actions |

## Install (Mac)

### Prerequisites

.NET SDK (needed to build EthanBot):
```bash
brew install dotnet
```

### One-command install

```bash
curl -fsSL https://raw.githubusercontent.com/yya29722-del/ethan-bot/main/smapi-mod/install.sh | bash
```

This will:
1. Pull latest code
2. Build and install EthanBot mod
3. Download and install NagiBridge mod (prebuilt, no compile needed)
4. Install Python dependencies

### Start Ethan

After restarting Stardew Valley:

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
python3 ~/ethan-bot/smapi-mod/ethan_agent.py
```

Ethan will check game state every 60 seconds and decide what to do — farming, mining, talking to yaya.

## What Ethan can do

Via NagiBridge's 18 game tools:

- **Move**: walk anywhere, teleport to any location
- **Farm**: till soil, plant seeds, water crops, harvest
- **Mine**: go to the mines, swing pickaxe, collect ore
- **Shop**: buy from Pierre, Willy, Clint, etc.
- **Sell**: ship items via the shipping bin
- **Interact**: talk to NPCs, use machines, open chests
- **Craft**: make items from inventory
- **Chat**: send messages to yaya in-game

## How it works

```
Stardew Valley
  └── SMAPI
        ├── EthanBot.dll     → Ethan NPC companion (visual presence)
        └── NagiBridge.dll   → HTTP server on localhost:7842

ethan_agent.py
  ├── GET  /state            → read game state
  ├── POST /move             → walk to tile
  ├── POST /warp             → teleport
  ├── POST /tool             → use tool
  ├── POST /interact         → interact with object/NPC
  ├── POST /chat/push        → send message in-game
  └── ... 13 more endpoints
```
