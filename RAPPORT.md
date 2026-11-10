# Rapport final

## Résultat
L'app publique est sur la branche `release` : éditeur d'accords à voix glissantes, 19 instruments doux + basse,
pistes basse / batterie / mélodie, mixeur, export vidéo / WAV / MIDI / projet, PWA hors ligne, « My projects »,
annuler / rétablir, guide de premier lancement. `npm run check` est vert (lint, types, 42 tests unitaires,
7 fichiers de tests navigateur).

## Audit final
- Fichiers, noms de fichiers, métadonnées des icônes et de la police : 0 résultat sur la liste de termes.
- Historique de `release` et des branches d'étape : un seul auteur, adresse no-reply, aucun co-auteur.
- Deux réserves : (1) la branche `main` contient encore l'ancien commit placeholder, dont l'auteur porte une adresse
  personnelle ; (2) une ancienne version de PROGRESS.md, dans l'historique, citait le nom d'un produit tiers dans une
  règle de nommage (aucune donnée personnelle). Les deux disparaissent avec l'étape manuelle 1 ci-dessous si on
  repart d'un commit unique.

## Exigences produit
Détail dans QA.md. Cochées : autonome, hors ligne, sauvegarde et projets, import/export, guide, aide, annuler/rétablir,
raccourcis, messages d'erreur, mobile 375 px et cibles 44 px, rotation, accessibilité de base, zéro erreur console.
Non vérifiables ici : installation réelle sur iPhone/Android, mode silencieux et retour d'arrière-plan sur iPhone,
fluidité et craquements sur un vrai téléphone, 10 minutes de lecture, écoute des instruments.
Écart assumé : supprimer un accord ou une note ne demande pas de confirmation (bouton Undo à la place).

## Bugs
Corrigés : 4 (voir QA.md). Restants : petite marche à la jonction de la boucle audio ; son Opus dans le MP4 là où
le navigateur n'encode pas l'AAC ; grille de mélodie limitée à la tonalité et sans clavier.

## Décisions prises seul (résumé de DECISIONS.md)
- Découpage en modules fait dès l'étape 2. Format de projet v2 avec migration.
- Instruments : la première liste a été annulée à ta demande ; 15 sons doux et nostalgiques ajoutés à la place,
  écrits directement (budget d'usage), mesurés automatiquement mais jamais écoutés.
- Pistes fixes (voix, accords, basse, batterie, mélodie), motifs pour basse et batterie.
- Police Inter (licence OFL, redistribuable) et mp4-muxer (MIT) inclus dans le build.
- PR mergées par fast-forward pour garder un seul auteur. L'étape 5 a été poussée sur `release` sans PR (oubli).

## URL Pages attendue
https://voiceglide.github.io/IV/

## À faire à la main
1. Remplacer `main` par `release` : soit Settings → Branches → branche par défaut = `release` puis supprimer `main`,
   soit `git push --force origin release:main` depuis ta machine. Pour effacer aussi la réserve (2), repartir d'un
   commit unique : `git checkout --orphan clean release && git commit -m "Initial commit" && git push --force origin clean:main`.
2. Settings → Emails → cocher « Keep my email addresses private » sur le compte, avant tout commit depuis le site.
3. Activer Pages : Settings → Pages → Source : GitHub Actions.
4. Choisir le nom et remplacer `APP_NAME` dans `src/config.js`.
5. Plus tard : domaine perso, Worker pour `FEEDBACK_URL` (variable de dépôt `FEEDBACK_URL`).
6. Tester sur un vrai iPhone et un vrai Android, et écouter les instruments.
