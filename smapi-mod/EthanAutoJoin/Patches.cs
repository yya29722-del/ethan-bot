using HarmonyLib;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Input;

namespace EthanAutoJoin
{
    /// <summary>
    /// Intercepts GamePad.GetState so we can inject a fake "Start button pressed"
    /// for PlayerIndex.Two when the local co-op join prompt is showing.
    /// </summary>
    [HarmonyPatch(typeof(GamePad), nameof(GamePad.GetState), new[] { typeof(PlayerIndex) })]
    public static class GamePadGetStatePatch
    {
        public static void Postfix(PlayerIndex playerIndex, ref GamePadState __result)
        {
            if (playerIndex != PlayerIndex.Two) return;
            if (!ModEntry.InjectJoin) return;

            ModEntry.InjectJoin = false;

            // Build a fake gamepad state with the Start (☰) button held
            __result = new GamePadState(
                new GamePadThumbSticks(Vector2.Zero, Vector2.Zero),
                new GamePadTriggers(0f, 0f),
                new GamePadButtons(Buttons.Start),
                new GamePadDPad(
                    ButtonState.Released, ButtonState.Released,
                    ButtonState.Released, ButtonState.Released)
            );
        }
    }
}
