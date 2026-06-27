# EthanBot SMAPI Mod

让 Ethan 在星露谷里陪你玩。

## 安装步骤（Mac）

### 1. 安装 .NET 6 SDK

去这里下载 Mac 版：https://dotnet.microsoft.com/download/dotnet/6.0
（选 macOS，Installer，x64 或 Arm64 看你的 Mac）

装完后打开 Terminal 验证：
```bash
dotnet --version
```

### 2. 编译 Mod

```bash
cd smapi-mod/EthanBot
dotnet build
```

编译完成后会在 `bin/Debug/net6.0/` 里生成 `EthanBot.dll`。

### 3. 安装到游戏

把整个 `EthanBot` 文件夹（含 manifest.json + EthanBot.dll）复制到：
```
~/Library/Application Support/Steam/steamapps/common/Stardew Valley/Contents/MacOS/Mods/EthanBot/
```

### 4. 运行（可选：AI 回复）

如果想让 Ethan 根据游戏状态说话，需要运行 Python 监控脚本：

```bash
pip install anthropic
export ANTHROPIC_API_KEY=sk-ant-你的key
python3 smapi-mod/ethan-watcher.py
```

没有这个脚本的话，Mod 也会自动说内置的台词（进入游戏时打招呼、换地图时评论等）。
