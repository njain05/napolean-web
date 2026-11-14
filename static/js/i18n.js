/**
 * Napoléon — English / French language toggle.
 *
 * The page is authored in French. This file translates every visible label to
 * plain English (the default) and back, without touching the page layout.
 * Text the app inserts later (status badge, graph drawer, empty states) is
 * translated as it appears, via a MutationObserver.
 */
(function () {
    'use strict';

    // Exact French text -> English. Keys are matched on trimmed text.
    const FR_EN = {
        // Page title & header
        'Napoléon — Quartier Général Impérial de Reconnaissance Numérique': 'Napoléon — AI Web Research Crawler',
        '✦ GRAND ÉTAT-MAJOR DE LA GRANDE ARMÉE DIGITALE ✦': '✦ AI-POWERED WEB RESEARCH CRAWLER ✦',
        'RECONNAISSANCE STRATÉGIQUE, CARTOGRAPHIE MILITAIRE & ANALYSE DE FORTERESSES': 'AI WEB CRAWLING, RESEARCH & SECURITY ANALYSIS',
        'GARNISON EN ATTENTE': 'IDLE — READY',
        'CAMPAGNE EN COURS': 'SCAN RUNNING',
        'MOBILIZING TROOPS...': 'STARTING SCAN...',
        'Scellé par l\'Empereur': 'Napoléon',
        'Sons de télégraphe militaire': 'Sound effects on/off',

        // Counters
        'Territoires Reconquis': 'Pages Crawled',
        'Pages inspectées': 'Pages visited',
        'Passages & Voies': 'Links Found',
        'Liens cartographiés': 'Links discovered',
        'Échelon d\'Avancée': 'Current Depth',
        'Profondeur de fouille': 'Clicks from start page',
        'Entités Déchiffrées': 'Entities Found',
        'Personnes, lieux, forces': 'People, places, organisations',
        'Failles & Menaces': 'Security Issues',
        'Vulnérabilités décelées': 'Potential vulnerabilities',
        'Vélocité de Marche': 'Speed',
        'Pages par seconde': 'Pages per second',

        // Launcher
        'ORDRE DE MARCHE & PLAN DE BATAILLE': 'NEW SCAN',
        'Formations Tactiques:': 'Presets:',
        'Éclaireurs Légers': 'Quick',
        'Conquête Impériale': 'Standard',
        'Siège de Forteresse': 'Security Audit',
        'Grand Mémoire d\'État': 'Full Research',
        'Coordonnées de la Cible (URL)': 'Website to scan (URL)',
        'Cibles Notables': 'Examples',
        'Example.com (Épreuve Rapide)': 'Example.com (quick test)',
        'Archives Encyclopédiques': 'Wikipedia',
        'Inscrivez le domaine à conquérir. Nos éclaireurs en cartographieront chaque ramification.': 'Enter the website to crawl. Napoléon follows its links and maps every page it finds.',
        'Objectif Stratégique / Intention Sémantique (Optionnel)': 'What are you researching? (optional)',
        'Ex: vulnérabilités, dirigeants, technologie, brevets': 'e.g. vulnerabilities, leadership, technology, patents',
        'L\'intelligence artificielle pondère la valeur de chaque bastion conquis selon cet ordre.': 'The AI scores every page by how relevant it is to this topic and skips the irrelevant ones.',
        'Profondeur d\'Infiltration:': 'Crawl depth:',
        '1 (Raid)': '1 (Shallow)',
        '2 (Avancée)': '2',
        '3 (Siège)': '3',
        '5 (Conquête Totale)': '5 (Deep)',
        'Corps de Reconnaissance': 'Fetch method',
        'Cavalerie Rapide (Requêtes HTTP Légères)': 'Fast (plain HTTP requests)',
        'Artillerie Lourde (Navigateur Chrome / JavaScript)': 'Full browser (Chrome, for JavaScript sites)',
        'Régiments Engagés': 'Include',
        'Reconnaissance de Failles': 'Security scan',
        'Mémoire de Recherche': 'Research report',
        'Cartographie des Réseaux': 'Link graph',
        'Décret d\'Ordre Terminal (Traduction automatique en commande d\'exécution):': 'Same scan from the command line:',
        'Copier l\'Ordre': 'Copy command',
        '"La stratégie est l\'art de faire bon usage du temps et de la distance."': '"Strategy is the art of making use of time and space."',
        'Sonner la Retraite': 'Stop',
        'DÉPLOYER LA CAMPAGNE': 'START SCAN',

        // Tabs
        'Télégraphe de Campagne': 'Live Log',
        'Carte Stratégique (Cartographie)': 'Graph',
        'Registre des Failles': 'Security',
        'Gazette & Rapport d\'État': 'Report',
        'Cadastre des Bastions Conquis': 'Pages',
        'Annales des Campagnes': 'History',

        // Live log
        'DÉPÊCHES TÉLÉGRAPHIQUES OPTIQUES CHAPPE — POSTE DU QUARTIER GÉNÉRAL': 'LIVE CRAWL LOG',
        'Rayer': 'Clear',
        'Déroulement: OUI': 'Auto-Scroll: ON',
        'Copier': 'Copy',
        '⚜️ Télégraphe de campagne armé et opérationnel. En attente des décrets de l\'Empereur.': '⚜️ Ready. Waiting for a scan to start.',
        'Prêt pour la reconnaissance. Définissez la cible ci-dessus et ordonnez la marche.': 'Enter a website above and press START SCAN.',
        'Dépêches rayées par l\'officier de garde.': 'Log cleared.',

        // Graph
        'Carte Unifiée': 'Everything',
        'Topologie Seule': 'Pages only',
        'Entités & Personnages': 'Entities',
        'Rechercher territoire ou nom...': 'Search pages or names...',
        'Bastion': 'Page',
        'Cible Majeure': 'Highly relevant',
        'Entité Décodée': 'Entity',
        'Recadrer la carte': 'Fit graph to screen',
        'Centrer la Carte': 'Fit to screen',
        'RAPPORT D\'ÉCLAIREUR': 'DETAILS',
        'Sélectionnez un point sur la carte pour consulter les mémoires de nos officiers.': 'Click a dot on the graph to see its details.',
        'Carte Vierge': 'No graph yet',
        'Ordonnez une reconnaissance pour dresser le réseau des bastions et tracer les voies.': 'Run a scan to draw the map of pages and links.',
        'MÉMOIRE D\'ÉCLAIREUR': 'PAGE DETAILS',
        'ENTITÉ': 'ENTITY',
        'Ramifications Militaires': 'Connections',
        'Bastion sans titre': 'Untitled page',
        'Notes de Reconnaissance': 'Summary',
        'Aucun rapport d\'observation rédigé pour ce bastion.': 'No summary for this page.',
        'Correspondances Interceptées (Courriels)': 'Email addresses found',
        'Personnages & Forces Détectés': 'People, places & organisations',

        // Security
        'REGISTRE DES FAIBLESSES & SECRETS INTERCEPTÉS': 'SECURITY FINDINGS',
        'Inventaire des failles de sécurité, clés dérobées et points d\'assaut identifiés.': 'Possible vulnerabilities, exposed secrets and attack surfaces spotted in the crawled pages.',
        'Exporter le Registre (JSON)': 'Export (JSON)',
        'Appareil Technologique & Ouvrages Détectés': 'Technologies detected',
        'Aucune infrastructure ennemie examinée pour l\'instant.': 'Nothing scanned yet.',
        'Gravité': 'Severity',
        'Nature': 'Type',
        'Description du Péril': 'Description',
        'Bastion d\'Attache': 'Page',
        'Le registre est immaculé. Aucune brèche hostile n\'a encore été signalée par nos vigies.': 'No security issues reported yet.',

        // Report
        'GAZETTE OFFICIELLE DU QUARTIER GÉNÉRAL': 'RESEARCH REPORT',
        'Synthèse de l\'état des lieux et mémoire analytique pour sa Majesté.': 'Summary of what the scan found.',
        'Format JSON': 'JSON',
        'Gazette Markdown': 'Markdown',
        'VOLUME I — MÉMOIRE STRATÉGIQUE': 'SUMMARY',
        'Le résumé du renseignement sera calligraphié ici à l\'issue de l\'opération.': 'The summary appears here when a scan finishes.',
        'DÉPÊCHES DE HAUTE VALEUR': 'MOST RELEVANT PAGES',
        'Aucun fief de haut rang recensé.': 'No ranked pages yet.',
        'ENTITÉS & PERSONNAGES CLÉS': 'KEY PEOPLE, PLACES & ORGANISATIONS',
        'Les dignitaires et lieux déchiffrés figureront ici.': 'Entities found by the AI appear here.',
        'CHAMPS SÉMANTIQUES MAJEURS': 'MAIN TOPICS',
        'Les vocables directeurs seront indexés ici.': 'Top keywords appear here.',

        // Pages table
        'CADASTRE GÉNÉRAL DES FIEFS TRAVERSÉS': 'ALL CRAWLED PAGES',
        'Filtrer par intitulé ou adresse...': 'Filter by title or URL...',
        'Intitulé du Fief': 'Title',
        'Coordonnées (URL)': 'URL',
        'Intérêt Sémantique': 'Relevance',
        'Entités Relevées': 'Entities',
        'Courriers & Secrets': 'Emails',
        'Le cadastre est vierge. Ordonnez une marche en campagne pour y inscrire vos conquêtes.': 'No pages yet. Run a scan to fill this table.',

        // History
        'LIVRE D\'OR DES CAMPAGNES ANTÉRIEURES': 'PAST SCANS',
        'Relire les Annales': 'Refresh',
        'Matricule': 'ID',
        'Fief Assiégé': 'Website',
        'Objectif Déclaré': 'Topic',
        'Issue': 'Result',
        'Bastions': 'Pages',
        'Périls': 'Issues',
        'Durée': 'Duration',
        'Aucun haut fait n\'a encore été consigné dans les annales.': 'No scans recorded yet.',

        // Footer
        '⚜ RECONNAISSANCE STRATÉGIQUE DE L\'EMPIRE ⚜': '⚜ NAPOLÉON — AI WEB RESEARCH CRAWLER ⚜',
        'Conçu selon les canons de la Grande Armée sous le commandement de Preetinderjeet Singh. Tous droits réservés.': 'Built by Preetinderjeet Singh. All rights reserved.',
    };

    // French text with numbers or names inside it.
    const FR_EN_PATTERNS = [
        [/^ENTITÉ DÉCHIFFRÉE \((.+)\)$/, 'ENTITY ($1)'],
        [/^Rattaché à (\d+) bastion\(s\) exploré\(s\)\.$/, 'Mentioned on $1 crawled page(s).'],
        [/^Valeur Tactique: (.+)$/, 'Relevance: $1'],
    ];

    const STORAGE_KEY = 'napoleon-lang';
    const ATTRS = ['placeholder', 'title'];
    let lang = 'en';
    try { lang = localStorage.getItem(STORAGE_KEY) || 'en'; } catch (e) { /* storage unavailable */ }

    function toEnglish(french) {
        if (Object.prototype.hasOwnProperty.call(FR_EN, french)) return FR_EN[french];
        for (const [re, en] of FR_EN_PATTERNS) {
            if (re.test(french)) return french.replace(re, en);
        }
        return null;
    }

    // Each translated text node / attribute remembers its French original,
    // so switching back to French is exact.
    function translateTextNode(node) {
        const raw = node.nodeValue;
        if (!raw || !raw.trim()) return;
        if (lang === 'en') {
            const trimmed = raw.trim();
            const en = toEnglish(trimmed);
            if (en === null) return;
            node.__napoleonFr = raw;
            node.nodeValue = raw.replace(trimmed, en);
        } else if (node.__napoleonFr !== undefined) {
            node.nodeValue = node.__napoleonFr;
            delete node.__napoleonFr;
        }
    }

    function translateAttrs(el) {
        for (const attr of ATTRS) {
            if (!el.hasAttribute(attr)) continue;
            const store = '__napoleonFr_' + attr;
            if (lang === 'en') {
                const en = toEnglish(el.getAttribute(attr).trim());
                if (en === null) continue;
                el[store] = el.getAttribute(attr);
                el.setAttribute(attr, en);
            } else if (el[store] !== undefined) {
                el.setAttribute(attr, el[store]);
                delete el[store];
            }
        }
    }

    function translateTree(root) {
        if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root); return; }
        if (root.nodeType !== Node.ELEMENT_NODE) return;
        if (root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
        translateAttrs(root);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
            if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
            else translateAttrs(node);
            node = walker.nextNode();
        }
    }

    function translateTitle() {
        if (lang === 'en') {
            const en = toEnglish(document.title);
            if (en !== null) { document.__napoleonFrTitle = document.title; document.title = en; }
        } else if (document.__napoleonFrTitle) {
            document.title = document.__napoleonFrTitle;
            delete document.__napoleonFrTitle;
        }
    }

    function updateToggle() {
        const btn = document.getElementById('btn-lang-toggle');
        if (!btn) return;
        // The button shows the language you will switch TO.
        btn.textContent = lang === 'en' ? 'FR' : 'EN';
        btn.title = lang === 'en' ? 'Passer en français' : 'Switch to English';
    }

    function setLang(next) {
        lang = next;
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* storage unavailable */ }
        document.documentElement.lang = lang;
        translateTree(document.body);
        translateTitle();
        updateToggle();
    }

    // Translate whatever the app inserts later (only matters in English mode).
    const observer = new MutationObserver((mutations) => {
        if (lang !== 'en') return;
        for (const m of mutations) {
            if (m.type === 'characterData') translateTextNode(m.target);
            else m.addedNodes.forEach(translateTree);
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('btn-lang-toggle');
        if (btn) btn.addEventListener('click', () => setLang(lang === 'en' ? 'fr' : 'en'));
        setLang(lang);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    window.napoleonI18n = { setLang, getLang: () => lang };
})();
