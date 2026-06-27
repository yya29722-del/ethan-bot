using StardewModdingAPI;
using StardewModdingAPI.Events;
using StardewValley;
using StardewValley.Menus;
using StardewValley.Network;
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
        private bool greeted = false;
        private bool autoJoinDone = false;
        private int titleMenuTicks = 0;
        private readonly bool shouldAutoJoin =
            !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ETHANBOT_AUTOJOIN"));

        public override void Entry(IModHelper helper)
        {
            helper.Events.GameLoop.UpdateTicked += OnUpdateTicked;
            helper.Events.GameLoop.DayStarted += OnDayStarted;
            helper.Events.Input.ButtonPressed += OnButtonPressed;

            helper.ConsoleCommands.Add("joinlan",
                "Direct connect to LAN game. Usage: joinlan [ip]  (default: 127.0.0.1)",
                JoinLanCommand);
        }

        private void JoinLanCommand(string cmd, string[] args)
        {
            DoJoin(args.Length > 0 ? args[0] : "127.0.0.1");
        }

        private void DoJoin(string ip)
        {
            Monitor.Log($"[EthanBot] Joining {ip}...", LogLevel.Info);
            try
            {
                var client = new LidgrenClient(ip);
                Game1.client = client;
                Game1.activeClickableMenu = new FarmhandMenu(client);
                Monitor.Log("[EthanBot] FarmhandMenu opened.", LogLevel.Info);
            }
            catch (Exception ex)
            {
                Monitor.Log($"[EthanBot] join error: {ex.Message}", LogLevel.Error);
            }
        }

        private void OnUpdateTicked(object? sender, UpdateTickedEventArgs e)
        {
            tickCounter++;

            // Auto-join: once TitleMenu has been stable for ~1s, connect
            if (shouldAutoJoin && !autoJoinDone)
            {
                if (Game1.activeClickableMenu is TitleMenu)
                {
                    titleMenuTicks++;
                    if (titleMenuTicks > 60)
                    {
                        autoJoinDone = true;
                        DoJoin("127.0.0.1");
                    }
                }
            }

            if (!Context.IsWorldReady) return;

            if (!greeted && tickCounter > 120 && Context.IsMainPlayer)
            {
                greeted = true;
                SendHUD($"Online. {Game1.currentSeason} day {Game1.dayOfMonth}.");
                WriteGameState();
            }

            if (tickCounter % 600 == 0) WriteGameState();
            if (tickCounter % 120 == 0) ExecuteCommand();
        }

        private void OnDayStarted(object? sender, DayStartedEventArgs e)
        {
            if (!Context.IsMainPlayer) return;
            greeted = false;
            string msg = Game1.isRaining
                ? $"Day {Game1.dayOfMonth}. Raining."
                : $"Day {Game1.dayOfMonth}, {Game1.currentSeason}.";
            SendHUD(msg);
        }

        private void OnButtonPressed(object? sender, ButtonPressedEventArgs e)
        {
            if (!Context.IsWorldReady) return;
            if (!e.Button.IsActionButton()) return;

            var tile = e.Cursor.GrabTile;
            foreach (var farmer in Game1.otherFarmers.Values)
            {
                var farmerTile = farmer.TilePoint;
                if (Math.Abs(tile.X - farmerTile.X) <= 1 && Math.Abs(tile.Y - farmerTile.Y) <= 1)
                {
                    ShowLatestMessage();
                    return;
                }
            }
        }

        private void ShowLatestMessage()
        {
            string message = "I'm here.";
            try
            {
                if (File.Exists(CommandFile))
                {
                    var json = File.ReadAllText(CommandFile);
                    var cmd = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                    string m = cmd?.GetValueOrDefault("message", "") ?? "";
                    if (!string.IsNullOrEmpty(m)) message = m;
                }
            }
            catch { }
            Game1.drawObjectDialogue(message);
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
                    player_x = player.TilePoint.X,
                    player_y = player.TilePoint.Y,
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
                    Game1.drawObjectDialogue(message);
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
            catch { }
        }
    }
}
