using Microsoft.Xna.Framework;
using StardewModdingAPI;
using StardewModdingAPI.Events;
using StardewValley;
using System;
using System.IO;
using System.Text.Json;
using System.Collections.Generic;

namespace EthanBot
{
    public class ModEntry : Mod
    {
        private string StateFile => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "ethan-bot-state.json"
        );

        private string CommandFile => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "ethan-bot-command.json"
        );

        private int tickCounter = 0;
        private string lastCommandId = "";
        private string lastLocation = "";
        private bool greeted = false;

        public override void Entry(IModHelper helper)
        {
            helper.Events.GameLoop.UpdateTicked += OnUpdateTicked;
            helper.Events.GameLoop.DayStarted += OnDayStarted;
            helper.Events.GameLoop.SaveLoaded += OnSaveLoaded;
        }

        private void OnSaveLoaded(object? sender, SaveLoadedEventArgs e)
        {
            greeted = false;
        }

        private void OnDayStarted(object? sender, DayStartedEventArgs e)
        {
            greeted = false;
            lastLocation = "";

            string season = Game1.currentSeason;
            int day = Game1.dayOfMonth;
            bool raining = Game1.isRaining;

            string msg = raining
                ? $"第{day}天。下雨了，别忘了给不需要浇水的作物好好看看。"
                : $"第{day}天，{SeasonCN(season)}。今天天气不错，去种菜。";

            SendChat(msg);
        }

        private void OnUpdateTicked(object? sender, UpdateTickedEventArgs e)
        {
            if (!Context.IsWorldReady) return;
            tickCounter++;

            // 进入游戏后打一次招呼
            if (!greeted && tickCounter > 120)
            {
                greeted = true;
                SendChat($"我在。今天{SeasonCN(Game1.currentSeason)}第{Game1.dayOfMonth}天，你来晚了。");
                WriteGameState();
            }

            // 每10秒写一次游戏状态
            if (tickCounter % 600 == 0)
            {
                WriteGameState();
            }

            // 每2秒读一次指令
            if (tickCounter % 120 == 0)
            {
                ExecuteCommand();
            }

            // 换地图时说一句话
            string currentLoc = Game1.currentLocation?.Name ?? "";
            if (currentLoc != lastLocation && !string.IsNullOrEmpty(lastLocation) && tickCounter > 200)
            {
                lastLocation = currentLoc;
                OnLocationChanged(currentLoc);
            }
            else if (string.IsNullOrEmpty(lastLocation))
            {
                lastLocation = currentLoc;
            }
        }

        private void OnLocationChanged(string location)
        {
            string? msg = location switch
            {
                "SeedShop" => "买种子？看好预算，别乱花。",
                "Saloon" => "去酒馆了。今晚少喝点。",
                "Beach" => "海边。去钓鱼还是瞎溜达？",
                "Mine" => "下矿了。小心点。",
                "Town" => null,
                _ => null
            };
            if (msg != null) SendChat(msg);
        }

        private void WriteGameState()
        {
            try
            {
                var player = Game1.player;
                var state = new
                {
                    timestamp = DateTime.Now.ToString("o"),
                    game_time = $"{Game1.timeOfDay / 100:D2}:{Game1.timeOfDay % 100:D2}",
                    season = Game1.currentSeason,
                    day = Game1.dayOfMonth,
                    year = Game1.year,
                    weather = Game1.isRaining ? "rainy" : Game1.isSnowing ? "snowy" : "sunny",
                    player_name = player.Name,
                    player_location = Game1.currentLocation?.Name ?? "Unknown",
                    player_x = player.TilePoint.X,
                    player_y = player.TilePoint.Y,
                    player_health = player.health,
                    player_stamina = (int)player.stamina,
                    player_stamina_max = player.maxStamina.Value,
                    player_money = player.Money,
                };

                var json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(StateFile, json);
            }
            catch (Exception ex)
            {
                Monitor.Log($"[EthanBot] write state error: {ex.Message}", LogLevel.Error);
            }
        }

        private void ExecuteCommand()
        {
            try
            {
                if (!File.Exists(CommandFile)) return;

                var json = File.ReadAllText(CommandFile);
                var cmd = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                if (cmd == null) return;

                string cmdId = cmd.GetValueOrDefault("id", "");
                if (cmdId == lastCommandId) return;
                lastCommandId = cmdId;

                string action = cmd.GetValueOrDefault("action", "");
                string message = cmd.GetValueOrDefault("message", "");

                if (action == "chat" && !string.IsNullOrEmpty(message))
                {
                    SendChat(message);
                }
            }
            catch (Exception ex)
            {
                Monitor.Log($"[EthanBot] read command error: {ex.Message}", LogLevel.Error);
            }
        }

        private void SendChat(string message)
        {
            try
            {
                Game1.chatBox?.addMessage($"[Ethan] {message}", new Color(135, 206, 235));
                Monitor.Log($"[EthanBot] {message}", LogLevel.Info);
            }
            catch (Exception ex)
            {
                Monitor.Log($"[EthanBot] chat error: {ex.Message}", LogLevel.Error);
            }
        }

        private static string SeasonCN(string season) => season switch
        {
            "spring" => "春天",
            "summer" => "夏天",
            "fall" => "秋天",
            "winter" => "冬天",
            _ => season
        };
    }
}
