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
        private NPC? ethanNpc;

        public override void Entry(IModHelper helper)
        {
            helper.Events.GameLoop.UpdateTicked += OnUpdateTicked;
            helper.Events.GameLoop.DayStarted += OnDayStarted;
            helper.Events.GameLoop.SaveLoaded += OnSaveLoaded;
            helper.Events.Player.Warped += OnWarped;
        }

        private void OnSaveLoaded(object? sender, SaveLoadedEventArgs e)
        {
            greeted = false;
            lastLocation = "";
            SpawnEthan(Game1.currentLocation);
        }

        private void OnWarped(object? sender, WarpedEventArgs e)
        {
            // Follow player through location changes
            SpawnEthan(e.NewLocation);
        }

        private void SpawnEthan(GameLocation? location)
        {
            if (location == null) return;

            // Remove from all locations first
            foreach (var loc in Game1.locations)
                loc.characters.RemoveAll(c => c.Name == "EthanCompanion");
            ethanNpc = null;

            var startTile = new Vector2(Game1.player.getTileX() + 2, Game1.player.getTileY());
            var startPos = startTile * 64f;

            try
            {
                ethanNpc = new NPC(
                    new AnimatedSprite("Characters/Alex", 0, 16, 32),
                    startPos,
                    location.Name,
                    2,
                    "EthanCompanion",
                    false,
                    null
                );
                ethanNpc.displayName = "Ethan";
                location.addCharacter(ethanNpc);
                Monitor.Log($"[EthanBot] Ethan spawned at {startTile}", LogLevel.Info);
            }
            catch (Exception ex)
            {
                Monitor.Log($"[EthanBot] spawn error: {ex.Message}", LogLevel.Warn);
            }
        }

        private void OnDayStarted(object? sender, DayStartedEventArgs e)
        {
            greeted = false;
            lastLocation = "";
            string season = Game1.currentSeason;
            int day = Game1.dayOfMonth;
            bool raining = Game1.isRaining;

            string msg = raining
                ? $"第{day}天下雨了。不用浇水，省点体力。"
                : $"{SeasonCN(season)}第{day}天。去种菜。";
            SendHUD(msg);
        }

        private void OnUpdateTicked(object? sender, UpdateTickedEventArgs e)
        {
            if (!Context.IsWorldReady) return;
            tickCounter++;

            // 进入游戏后打一次招呼
            if (!greeted && tickCounter > 120)
            {
                greeted = true;
                SendHUD($"我在。{SeasonCN(Game1.currentSeason)}第{Game1.dayOfMonth}天。");
                WriteGameState();
            }

            // 每10秒写一次游戏状态
            if (tickCounter % 600 == 0)
                WriteGameState();

            // 每2秒读一次指令
            if (tickCounter % 120 == 0)
                ExecuteCommand();

            // 跟随玩家
            if (tickCounter % 2 == 0)
                FollowPlayer();

            // 换地图触发
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

        private void FollowPlayer()
        {
            if (ethanNpc == null) return;
            try
            {
                var playerPos = Game1.player.Position;
                var myPos = ethanNpc.Position;
                float dist = Vector2.Distance(playerPos, myPos);

                // 跟随但不贴太近
                if (dist > 160f && dist < 2000f)
                {
                    var dir = playerPos - myPos;
                    dir.Normalize();
                    ethanNpc.Position += dir * 2f;

                    // 更新朝向
                    if (Math.Abs(dir.X) > Math.Abs(dir.Y))
                        ethanNpc.FacingDirection = dir.X > 0 ? 1 : 3;
                    else
                        ethanNpc.FacingDirection = dir.Y > 0 ? 2 : 0;
                }
            }
            catch { /* ignore movement errors */ }
        }

        private void OnLocationChanged(string location)
        {
            string? msg = location switch
            {
                "SeedShop" => "买种子？看好预算。",
                "Saloon" => "去酒馆了。少喝。",
                "Beach" => "海边。钓鱼还是瞎走？",
                "Mine" => "下矿了。小心点。",
                _ => null
            };
            if (msg != null) SendHUD(msg);
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
                    weather = Game1.isRaining ? "rainy" : "sunny",
                    player_name = player.Name,
                    player_location = Game1.currentLocation?.Name ?? "Unknown",
                    player_x = player.getTileX(),
                    player_y = player.getTileY(),
                    player_health = player.health,
                    player_stamina = (int)player.stamina,
                    player_stamina_max = player.maxStamina.Value,
                    player_money = player.Money,
                };
                File.WriteAllText(StateFile,
                    JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }));
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
                    SendHUD(message);
            }
            catch (Exception ex)
            {
                Monitor.Log($"[EthanBot] command error: {ex.Message}", LogLevel.Error);
            }
        }

        private void SendHUD(string message)
        {
            try
            {
                Game1.addHUDMessage(new HUDMessage($"Ethan: {message}", HUDMessage.newQuest_type));
                Monitor.Log($"[EthanBot] {message}", LogLevel.Info);
            }
            catch (Exception ex)
            {
                Monitor.Log($"[EthanBot] HUD error: {ex.Message}", LogLevel.Error);
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
