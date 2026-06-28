using System;
using HarmonyLib;
using StardewModdingAPI;
using StardewModdingAPI.Events;

namespace EthanAutoJoin
{
    public class ModEntry : Mod
    {
        // Set to true to inject a fake Start-button press for PlayerIndex.Two next frame
        internal static volatile bool InjectJoin = false;

        private DateTime? _joinWindowStart = null;
        private bool _joinDone = false;

        public override void Entry(IModHelper helper)
        {
            var harmony = new Harmony(ModManifest.UniqueID);
            harmony.PatchAll();

            helper.Events.Input.ButtonPressed += OnButton;
            helper.Events.GameLoop.UpdateTicked += OnTick;
            helper.Events.GameLoop.ReturnedToTitle += (_, _) =>
            {
                _joinDone = false;
                _joinWindowStart = null;
                InjectJoin = false;
            };

            Monitor.Log("EthanAutoJoin ready. Press F5 in-game to open local co-op — join will be simulated automatically.", LogLevel.Info);
        }

        private void OnButton(object? sender, ButtonPressedEventArgs e)
        {
            if (e.Button == SButton.F5 && !_joinDone)
            {
                _joinWindowStart = DateTime.Now;
                Monitor.Log("F5 detected — will simulate join button in 1.5s...", LogLevel.Info);
            }

            // F8 = immediate manual trigger
            if (e.Button == SButton.F8)
            {
                Monitor.Log("F8: forcing join injection", LogLevel.Info);
                InjectJoin = true;
            }
        }

        private void OnTick(object? sender, UpdateTickedEventArgs e)
        {
            if (_joinDone || _joinWindowStart == null) return;

            var elapsed = (DateTime.Now - _joinWindowStart.Value).TotalSeconds;

            // Inject every ~30 ticks (0.5s) within the 1.5–8s window after F5
            if (elapsed >= 1.5 && elapsed < 8.0 && e.IsMultipleOf(30))
            {
                Monitor.Log($"Injecting fake join button (t={elapsed:F1}s after F5)", LogLevel.Debug);
                InjectJoin = true;
            }

            if (elapsed >= 8.0)
            {
                Monitor.Log("Join window closed (8s elapsed since F5).", LogLevel.Info);
                _joinWindowStart = null;
            }
        }

        // Called by the Harmony patch when join is successfully detected
        internal void OnJoinDetected()
        {
            _joinDone = true;
            _joinWindowStart = null;
            Monitor.Log("✓ Auto-join triggered! Create your Ethan character with mouse/keyboard.", LogLevel.Info);
        }
    }
}
