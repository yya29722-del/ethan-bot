using Microsoft.Xna.Framework;
using StardewModdingAPI;
using StardewModdingAPI.Events;
using StardewValley;
using StardewValley.Menus;
using StardewValley.Pathfinding;
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
        private string ChatFile => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "ethan-bot-chat.json"
        );

        private int tickCounter = 0;
        private string lastCommandId = "";
        private bool greeted = false;
        private NPC? ethanNpc;
        private int pathCooldown = 0;
        private int lastChatCount = 0;

        public override void Entry(IModHelper helper)
        {
            helper.Events.GameLoop.UpdateTicked += OnUpdateTicked;
            helper.Events.GameLoop.DayStarted += OnDayStarted;
            helper.Events.GameLoop.SaveLoaded += OnSaveLoaded;
            helper.Events.Player.Warped += OnWarped;
            helper.Events.Input.ButtonPressed += OnButtonPressed;
        }

        private void OnSaveLoaded(object? sender, SaveLoadedEventArgs e)
        {
            greeted = false;
            SpawnEthan(Game1.currentLocation);
        }

        private void OnWarped(object? sender, WarpedEventArgs e)
        {
            SpawnEthan(e.NewLocation);
        }

        private void OnButtonPressed(object? sender, ButtonPressedEventArgs e)
        {
            if (!Context.IsWorldReady || ethanNpc == null) return;
            if (!e.Button.IsActionButton()) return;

            var tile = e.Cursor.GrabTile;
            var ethanTile = ethanNpc.TilePoint;
            if (Math.Abs(tile.X - ethanTile.X) <= 1 && Math.Abs(tile.Y - ethanTile.Y) <= 1)
            {
                // write a click event to chat file so agent responds
                try
                {
                    var entry = new Dictionary<string, string>
                    {
                        ["id"] = $"click_{tickCounter}",
                        ["message"] = "[click] yaya tapped me"
                    };
                    File.WriteAllText(ChatFile,
                        JsonSerializer.Serialize(entry, new JsonSerializerOptions { WriteIndented = true }));
                }
                catch { }
            }
        }

        private void SpawnEthan(GameLocation? location)
        {
            if (location == null) return;

            foreach (var loc in Game1.locations)
            {
                var toRemove = new List<NPC>();
                foreach (var c in loc.characters)
                    if (c.Name == "EthanCompanion") toRemove.Add(c);
                foreach (var c in toRemove)
                    loc.characters.Remove(c);
            }
            ethanNpc = null;

            var pos = new Vector2(
                (Game1.player.TilePoint.X + 2) * 64,
                Game1.player.TilePoint.Y * 64
            );

            try
            {
                ethanNpc = new NPC(
                    new AnimatedSprite("Characters/Alex", 0, 16, 32),
                    pos,
                    location.Name,
                    2,
                    "EthanCompanion",
                    false,
                    null
                );
                ethanNpc.displayName = "Ethan";
                location.addCharacter(ethanNpc);
                Monitor.Log("[EthanBot] Spawned.", LogLevel.Info);
            }
            catch (Exception ex)
            {
                Monitor.Log($"[EthanBot] spawn error: {ex.Message}", LogLevel.Warn);
            }
        }

        private void OnDayStarted(object? sender, DayStartedEventArgs e)
        {
            greeted = false;
            string msg = Game1.isRaining
                ? $"Day {Game1.dayOfMonth}. Rain — skip watering."
                : $"Day {Game1.dayOfMonth}, {Game1.currentSeason}. Go farm.";
            SendHUD(msg);
        }

        private void OnUpdateTicked(object? sender, UpdateTickedEventArgs e)
        {
            if (!Context.IsWorldReady) return;
            tickCounter++;

            if (!greeted && tickCounter > 120)
            {
                greeted = true;
                SendHUD($"I'm here. {Game1.currentSeason} day {Game1.dayOfMonth}.");
                WriteGameState();
            }

            if (tickCounter % 600 == 0) WriteGameState();
            if (tickCounter % 120 == 0) ExecuteCommand();
            if (tickCounter % 30 == 0) CheckNewChat();

            // 寻路跟随——每60tick重新计算一次路径
            if (tickCounter % 60 == 0) UpdatePath();
        }

        private void UpdatePath()
        {
            if (ethanNpc == null || Game1.currentLocation == null) return;

            var playerTile = Game1.player.TilePoint;
            var myTile = ethanNpc.TilePoint;
            float dist = Vector2.Distance(myTile.ToVector2(), playerTile.ToVector2());

            // 超过3格才重新寻路，避免卡在原地
            if (dist > 3f && ethanNpc.controller == null)
            {
                var target = new Point(playerTile.X + 1, playerTile.Y);
                try
                {
                    ethanNpc.controller = new PathFindController(
                        ethanNpc,
                        Game1.currentLocation,
                        target,
                        -1,
                        null
                    );
                }
                catch { /* ignore pathfind errors */ }
            }
        }

        private void ShowDialogue(string text)
        {
            if (ethanNpc == null) return;
            try
            {
                ethanNpc.CurrentDialogue.Clear();
                ethanNpc.CurrentDialogue.Push(new Dialogue(ethanNpc, "EthanBot_line", text));
                Game1.drawDialogue(ethanNpc);
            }
            catch (Exception ex)
            {
                Monitor.Log($"[EthanBot] dialogue error: {ex.Message}", LogLevel.Warn);
                SendHUD(text);
            }
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
                    ShowDialogue(message);
            }
            catch (Exception ex)
            {
                Monitor.Log($"[EthanBot] command error: {ex.Message}", LogLevel.Error);
            }
        }

        private void CheckNewChat()
        {
            try
            {
                var msgs = Game1.chatBox?.messages;
                if (msgs == null) return;
                if (msgs.Count < lastChatCount) lastChatCount = 0;
                if (msgs.Count == lastChatCount) return;

                for (int i = lastChatCount; i < msgs.Count; i++)
                {
                    var sb = new System.Text.StringBuilder();
                    foreach (var snippet in msgs[i].message)
                        if (snippet is ChatSnippet cs && cs.message != null)
                            sb.Append(cs.message);
                    string text = sb.ToString().Trim();
                    if (string.IsNullOrEmpty(text)) continue;

                    var entry = new Dictionary<string, string>
                    {
                        ["id"] = $"{i}_{tickCounter}",
                        ["message"] = text
                    };
                    File.WriteAllText(ChatFile,
                        JsonSerializer.Serialize(entry, new JsonSerializerOptions { WriteIndented = true }));
                    Monitor.Log($"[EthanBot] chat captured: {text}", LogLevel.Debug);
                }
                lastChatCount = msgs.Count;
            }
            catch (Exception ex)
            {
                Monitor.Log($"[EthanBot] chat capture error: {ex.Message}", LogLevel.Warn);
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
