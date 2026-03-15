/**
 * =============================================================================
 * INJECT BUNNY SCENE — One-time utility
 * =============================================================================
 *
 * Fetches the generated bunny image from /api/bunny-image, creates a new
 * "Bunny Meadow" scene node with it as the background, names it in the
 * asset manager, and writes a funny story text.
 *
 * Can be called from the browser console via: window.injectBunnyScene()
 * Or imported and called from a component.
 *
 * =============================================================================
 */

import { useProjectStore } from '@/stores/useProjectStore';
import { generateId } from '@/utils/idGenerator';
import { getAssetFingerprint } from '@/utils/assetFingerprint';

export async function injectBunnyScene(): Promise<string> {
  const store = useProjectStore.getState();
  const project = store.currentProject;

  if (!project) {
    throw new Error('No project is open. Open or create a project first.');
  }

  // 1. Fetch the base64 data URL from the Vite server
  console.log('[injectBunnyScene] Fetching bunny image...');
  const res = await fetch('/api/bunny-image');
  if (!res.ok) throw new Error('Failed to fetch bunny image from /api/bunny-image');
  const { dataUrl } = await res.json();
  if (!dataUrl) throw new Error('No dataUrl in response');
  console.log('[injectBunnyScene] Image loaded, size:', dataUrl.length, 'chars');

  // 2. Create the scene node
  const nodeId = generateId('node');
  const sceneCount = project.nodes.filter((n) => n.type === 'scene').length;

  const choice1Id = generateId('choice');
  const choice2Id = generateId('choice');
  const choice3Id = generateId('choice');

  const funnyText = `You stumble upon a sun-drenched meadow, and your jaw drops. Before you stretches a sight so impossibly adorable that your brain briefly forgets how to function.

Dozens — no, HUNDREDS — of the fluffiest bunnies you've ever seen are lounging in the grass like they own the place (they do). Their ears twitch in synchronized choreography. Their little noses wiggle with the confidence of creatures who know they're devastatingly cute.

But one bunny stands apart from the rest. Right in the center, a bold orange bunny has risen on its hind legs and is holding a wooden sign above its head with surprising upper-body strength for a three-pound herbivore. The sign reads:

"I LOVE CLAUDE CODE"

The other bunnies seem deeply supportive of this message. A few are nodding sagely. One appears to be weeping with pride. Another is trying to eat the sign, but that's neither here nor there.

You feel an overwhelming urge to respond.`;

  store.addNode({
    id: nodeId,
    type: 'scene',
    position: { x: 300 + sceneCount * 60, y: 200 + sceneCount * 60 },
    label: 'Bunny Meadow',
    data: {
      storyText: funnyText,
      speakerName: 'Narrator',
      backgroundImage: dataUrl,
      choices: [
        { id: choice1Id, label: '🐰 "I love Claude Code too!" (join the bunnies)' },
        { id: choice2Id, label: '🤔 "How do bunnies even know about Claude Code?"' },
        { id: choice3Id, label: '📸 Take a photo. Nobody will believe this.' },
      ],
      musicKeepPlaying: false,
      voiceoverAutoplay: false,
    },
  } as any);

  // 3. Name the asset in the asset manager via the store's updateAssetName action
  const fingerprint = getAssetFingerprint(dataUrl);
  if (fingerprint) {
    store.updateAssetName(fingerprint, 'Bunny Image');
  }

  console.log('[injectBunnyScene] Scene created:', nodeId);
  console.log('[injectBunnyScene] Asset named: "Bunny Image"');
  return nodeId;
}

// Expose on window for browser console access
if (typeof window !== 'undefined') {
  (window as any).injectBunnyScene = injectBunnyScene;
}
