/**
 * =============================================================================
 * INTERNATIONALIZATION — Translation Strings
 * =============================================================================
 *
 * Provides English (default) and German translations for all user-facing
 * text in the Dream-E interface. The active language is stored in
 * localStorage and can be switched via the language picker in the top bar.
 *
 * HOW TO ADD A NEW STRING:
 *   1. Add the key to the `en` object with the English text
 *   2. Add the same key to the `de` object with the German translation
 *   3. Use t('your.key') in components
 *
 * =============================================================================
 */

export type Language = 'en' | 'de';

export const translations: Record<Language, Record<string, string>> = {
  en: {
    // ── Top Bar ──
    'topbar.variables': 'Variables',
    'topbar.assets': 'Assets',
    'topbar.world': 'World',
    'topbar.chat': 'Chat',
    'topbar.notes': 'Notes',
    'topbar.settings': 'AI Settings',
    'topbar.play': 'Play',
    'topbar.help': 'Help',
    'topbar.save': 'Save',
    'topbar.saved': 'Saved',
    'topbar.saving': 'Saving...',
    'topbar.unsaved': 'Unsaved changes',
    'topbar.undo': 'Undo',
    'topbar.redo': 'Redo',
    'topbar.export': 'Export',
    'topbar.back': 'Back to Dashboard',

    // ── Toolbar (left sidebar) ──
    'toolbar.scene': 'Scene',
    'toolbar.scene.desc': 'Display story content',
    'toolbar.choice': 'Choice',
    'toolbar.choice.desc': 'Branch based on condition',
    'toolbar.modifier': 'Modifier',
    'toolbar.modifier.desc': 'Change variable values',
    'toolbar.comment': 'Comment',
    'toolbar.comment.desc': 'Add notes',
    'toolbar.storyRoot': 'Story Root',
    'toolbar.storyRoot.desc': 'Central story metadata',
    'toolbar.plot': 'Plot Arc',
    'toolbar.plot.desc': 'Narrative arc / subplot',
    'toolbar.act': 'Act',
    'toolbar.act.desc': 'Story act (e.g., Act 1, 2, 3)',
    'toolbar.cowriteScene': 'Scene',
    'toolbar.cowriteScene.desc': 'Detailed scene within an act',
    'toolbar.shot': 'Shot',
    'toolbar.shot.desc': 'Visual shot within a scene',
    'toolbar.character': 'Character',
    'toolbar.character.desc': 'Add a character to the web',
    'toolbar.drag': 'Drag to canvas',
    'toolbar.chat': 'AI Chat',

    // ── World Menu ──
    'world.characters': 'Characters',
    'world.locations': 'Locations',
    'world.objects': 'Objects',
    'world.concepts': 'Game Concepts',

    // ── Dashboard ──
    'dashboard.title': 'My Projects',
    'dashboard.newProject': 'New Project',
    'dashboard.newCowrite': 'New Co-Write Project',
    'dashboard.import': 'Import Project',
    'dashboard.noProjects': 'No projects yet. Create one to get started!',
    'dashboard.edit': 'Edit',
    'dashboard.play': 'Play',
    'dashboard.export': 'Export',
    'dashboard.delete': 'Delete',
    'dashboard.deleteConfirm': 'Are you sure you want to delete this project?',
    'dashboard.lastEdited': 'Last edited',
    'dashboard.scenes': 'scenes',
    'dashboard.entities': 'entities',

    // ── AI Settings Modal ──
    'aiSettings.title': 'AI Configuration',
    'aiSettings.imageGen': 'Image Generation',
    'aiSettings.writer': 'Story Writer (LLM)',
    'aiSettings.tts': 'Text-to-Speech',
    'aiSettings.active': 'Active',
    'aiSettings.noKey': 'No API Key',
    'aiSettings.provider': 'Provider',
    'aiSettings.model': 'Model',
    'aiSettings.voice': 'Voice',
    'aiSettings.defaultStyle': 'Default Style',
    'aiSettings.quota': 'Your Daily Quota',
    'aiSettings.quotaReset': 'Quotas reset daily at midnight UTC.',
    'aiSettings.tokens': 'tokens',
    'aiSettings.images': 'images',
    'aiSettings.seconds': 'sec',
    'aiSettings.openAdmin': 'Open Admin Panel',
    'aiSettings.adminNote': 'Configure API keys, models, and user limits in the admin panel.',
    'aiSettings.userNote': 'AI configuration is managed by your administrator. Contact them to change providers or increase quotas.',

    // ── Player / Adventure Engine ──
    'player.choices': 'What do you do?',
    'player.typeAction': 'Type your action...',
    'player.send': 'Send',
    'player.continue': 'Continue',
    'player.systemMenu': 'System Menu',
    'player.save': 'Save Game',
    'player.load': 'Load Game',
    'player.mainMenu': 'Main Menu',
    'player.resume': 'Resume',

    // ── Inspector ──
    'inspector.title': 'Inspector',
    'inspector.properties': 'Properties',
    'inspector.content': 'Content',
    'inspector.connections': 'Connections',
    'inspector.noSelection': 'Select a node or edge to inspect.',
    'inspector.storyText': 'Story Text',
    'inspector.choices': 'Choices',
    'inspector.addChoice': 'Add Choice',
    'inspector.background': 'Background Image',
    'inspector.music': 'Background Music',

    // ── Default start scene text ──
    'startScene.title': 'Welcome',
    'startScene.text': 'Your adventure begins here. Edit this scene to start building your story!',
    'startScene.choice1': 'Begin the adventure',
    'startScene.choice2': 'Look around',

    // ── Co-Write Mode ──
    'cowrite.storyRoot': 'Story Root',
    'cowrite.plot': 'Plot',
    'cowrite.act': 'Act',
    'cowrite.episode': 'Episode',
    'cowrite.scene': 'Scene',
    'cowrite.shot': 'Shot',
    'cowrite.character': 'Character',
    'cowrite.relationship': 'Relationship',
    'cowrite.turningPoint': 'Turning Point',
    'cowrite.cliffhanger': 'Cliffhanger',
    'cowrite.entityStateChanges': 'Entity State Changes',
    'cowrite.description': 'Description',

    // ── Canvas Tabs ──
    'canvas.storyCanvas': 'Story Canvas',
    'canvas.characterCanvas': 'Character Canvas',
    'canvas.stateChangeCanvas': 'State Change Canvas',

    // ── Misc ──
    'misc.confirm': 'Confirm',
    'misc.cancel': 'Cancel',
    'misc.close': 'Close',
    'misc.loading': 'Loading...',
    'misc.error': 'Error',
    'misc.success': 'Success',
    'misc.search': 'Search...',
    'misc.noResults': 'No results found.',
    'misc.language': 'Language',

    // ── Login / Auth ──
    'auth.login': 'Log In',
    'auth.register': 'Sign Up',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.displayName': 'Display Name',
    'auth.forgotPassword': 'Forgot Password?',
    'auth.noAccount': "Don't have an account?",
    'auth.hasAccount': 'Already have an account?',
    'auth.orGoogle': 'Or sign in with Google',
    'auth.logout': 'Log Out',
  },

  de: {
    // ── Top Bar ──
    'topbar.variables': 'Variablen',
    'topbar.assets': 'Medien',
    'topbar.world': 'Welt',
    'topbar.chat': 'Chat',
    'topbar.notes': 'Notizen',
    'topbar.settings': 'KI-Einstellungen',
    'topbar.play': 'Spielen',
    'topbar.help': 'Hilfe',
    'topbar.save': 'Speichern',
    'topbar.saved': 'Gespeichert',
    'topbar.saving': 'Speichert...',
    'topbar.unsaved': 'Ungespeicherte Änderungen',
    'topbar.undo': 'Rückgängig',
    'topbar.redo': 'Wiederherstellen',
    'topbar.export': 'Exportieren',
    'topbar.back': 'Zurück zum Dashboard',

    // ── Toolbar (left sidebar) ──
    'toolbar.scene': 'Szene',
    'toolbar.scene.desc': 'Story-Inhalt anzeigen',
    'toolbar.choice': 'Auswahl',
    'toolbar.choice.desc': 'Verzweigung nach Bedingung',
    'toolbar.modifier': 'Modifikator',
    'toolbar.modifier.desc': 'Variablenwerte ändern',
    'toolbar.comment': 'Kommentar',
    'toolbar.comment.desc': 'Notizen hinzufügen',
    'toolbar.storyRoot': 'Story-Grundlage',
    'toolbar.storyRoot.desc': 'Zentrale Story-Metadaten',
    'toolbar.plot': 'Handlungsstrang',
    'toolbar.plot.desc': 'Erzählbogen / Subplot',
    'toolbar.act': 'Akt',
    'toolbar.act.desc': 'Story-Akt (z.B. Akt 1, 2, 3)',
    'toolbar.cowriteScene': 'Szene',
    'toolbar.cowriteScene.desc': 'Detaillierte Szene innerhalb eines Aktes',
    'toolbar.shot': 'Einstellung',
    'toolbar.shot.desc': 'Visuelle Einstellung innerhalb einer Szene',
    'toolbar.character': 'Charakter',
    'toolbar.character.desc': 'Charakter zum Netz hinzufügen',
    'toolbar.drag': 'Auf Canvas ziehen',
    'toolbar.chat': 'KI-Chat',

    // ── World Menu ──
    'world.characters': 'Charaktere',
    'world.locations': 'Orte',
    'world.objects': 'Objekte',
    'world.concepts': 'Spielkonzepte',

    // ── Dashboard ──
    'dashboard.title': 'Meine Projekte',
    'dashboard.newProject': 'Neues Projekt',
    'dashboard.newCowrite': 'Neues Co-Write Projekt',
    'dashboard.import': 'Projekt importieren',
    'dashboard.noProjects': 'Noch keine Projekte. Erstelle eines, um loszulegen!',
    'dashboard.edit': 'Bearbeiten',
    'dashboard.play': 'Spielen',
    'dashboard.export': 'Exportieren',
    'dashboard.delete': 'Löschen',
    'dashboard.deleteConfirm': 'Bist du sicher, dass du dieses Projekt löschen willst?',
    'dashboard.lastEdited': 'Zuletzt bearbeitet',
    'dashboard.scenes': 'Szenen',
    'dashboard.entities': 'Entitäten',

    // ── AI Settings Modal ──
    'aiSettings.title': 'KI-Konfiguration',
    'aiSettings.imageGen': 'Bildgenerierung',
    'aiSettings.writer': 'Story-Autor (LLM)',
    'aiSettings.tts': 'Sprachausgabe',
    'aiSettings.active': 'Aktiv',
    'aiSettings.noKey': 'Kein API-Schlüssel',
    'aiSettings.provider': 'Anbieter',
    'aiSettings.model': 'Modell',
    'aiSettings.voice': 'Stimme',
    'aiSettings.defaultStyle': 'Standard-Stil',
    'aiSettings.quota': 'Dein tägliches Kontingent',
    'aiSettings.quotaReset': 'Kontingente werden täglich um Mitternacht (UTC) zurückgesetzt.',
    'aiSettings.tokens': 'Tokens',
    'aiSettings.images': 'Bilder',
    'aiSettings.seconds': 'Sek.',
    'aiSettings.openAdmin': 'Admin-Panel öffnen',
    'aiSettings.adminNote': 'API-Schlüssel, Modelle und Benutzerlimits im Admin-Panel konfigurieren.',
    'aiSettings.userNote': 'Die KI-Konfiguration wird von deinem Administrator verwaltet. Wende dich an ihn, um Anbieter zu ändern oder Kontingente zu erhöhen.',

    // ── Player / Adventure Engine ──
    'player.choices': 'Was tust du?',
    'player.typeAction': 'Gib deine Aktion ein...',
    'player.send': 'Senden',
    'player.continue': 'Weiter',
    'player.systemMenu': 'Systemmenü',
    'player.save': 'Spiel speichern',
    'player.load': 'Spiel laden',
    'player.mainMenu': 'Hauptmenü',
    'player.resume': 'Fortsetzen',

    // ── Inspector ──
    'inspector.title': 'Inspektor',
    'inspector.properties': 'Eigenschaften',
    'inspector.content': 'Inhalt',
    'inspector.connections': 'Verbindungen',
    'inspector.noSelection': 'Wähle einen Knoten oder eine Kante aus.',
    'inspector.storyText': 'Erzähltext',
    'inspector.choices': 'Auswahlmöglichkeiten',
    'inspector.addChoice': 'Auswahl hinzufügen',
    'inspector.background': 'Hintergrundbild',
    'inspector.music': 'Hintergrundmusik',

    // ── Default start scene text ──
    'startScene.title': 'Willkommen',
    'startScene.text': 'Dein Abenteuer beginnt hier. Bearbeite diese Szene, um deine Geschichte zu erstellen!',
    'startScene.choice1': 'Das Abenteuer beginnen',
    'startScene.choice2': 'Sich umsehen',

    // ── Co-Write Mode ──
    'cowrite.storyRoot': 'Story-Grundlage',
    'cowrite.plot': 'Handlungsstrang',
    'cowrite.act': 'Akt',
    'cowrite.episode': 'Episode',
    'cowrite.scene': 'Szene',
    'cowrite.shot': 'Einstellung',
    'cowrite.character': 'Charakter',
    'cowrite.relationship': 'Beziehung',
    'cowrite.turningPoint': 'Wendepunkt',
    'cowrite.cliffhanger': 'Cliffhanger',
    'cowrite.entityStateChanges': 'Entitäts-Zustandsänderungen',
    'cowrite.description': 'Beschreibung',

    // ── Canvas Tabs ──
    'canvas.storyCanvas': 'Story-Canvas',
    'canvas.characterCanvas': 'Charakter-Canvas',
    'canvas.stateChangeCanvas': 'Zustandsänderungs-Canvas',

    // ── Misc ──
    'misc.confirm': 'Bestätigen',
    'misc.cancel': 'Abbrechen',
    'misc.close': 'Schließen',
    'misc.loading': 'Laden...',
    'misc.error': 'Fehler',
    'misc.success': 'Erfolg',
    'misc.search': 'Suchen...',
    'misc.noResults': 'Keine Ergebnisse gefunden.',
    'misc.language': 'Sprache',

    // ── Login / Auth ──
    'auth.login': 'Anmelden',
    'auth.register': 'Registrieren',
    'auth.email': 'E-Mail',
    'auth.password': 'Passwort',
    'auth.displayName': 'Anzeigename',
    'auth.forgotPassword': 'Passwort vergessen?',
    'auth.noAccount': 'Noch kein Konto?',
    'auth.hasAccount': 'Bereits ein Konto?',
    'auth.orGoogle': 'Oder mit Google anmelden',
    'auth.logout': 'Abmelden',
  },
};
