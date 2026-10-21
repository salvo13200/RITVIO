![RITVIO — Your music, with you.](docs/media/banner.webp)

# RITVIO

**Player musicale gratuito e open source per Windows e Android.** Ricerca, scoperta, libreria locale e interfacce pensate per ciascuna piattaforma.

[English](README.md) · **Italiano** · [Scarica RITVIO](https://salvo13200.github.io/RITVIO/) · [Galleria](docs/SCREENSHOTS.md)

[![Entra nella community Discord di RITVIO](https://img.shields.io/badge/Entra_su_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/hCMwUtWZuM)

> Versioni stabili: **Windows 1.0.0** e **Android 1.4.0**. [Scegli il download](https://salvo13200.github.io/RITVIO/) e consulta [note e limiti](docs/RELEASE_NOTES.md). La copertura dei dispositivi e dell’accessibilità nativa resta limitata.

[![Home desktop di RITVIO con interfaccia in inglese e raccolte caricate](docs/media/desktop-home.webp)](docs/media/desktop-home.webp)

Le schermate mostrano l'interfaccia reale in inglese, con dati dimostrativi e immagini sintetiche del progetto. Le catture mobile provengono dal renderer browser e non certificano il comportamento nativo su telefono. [Tutte le schermate](docs/SCREENSHOTS.md).

## Funzioni

- Ricerca di brani, artisti e album; classifiche globali, nuove uscite, radio e mix personali.
- Preferiti, playlist, artisti/album seguiti e cronologia conservati sul dispositivo.
- Coda modificabile, shuffle/repeat, timer, testi ed equalizzatore/controlli audio.
- Importazione/esportazione di playlist e condivisione di brani o versi come immagini 9:16.
- Aggiornamenti ufficiali nelle Impostazioni, riferimenti condivisibili ai brani e report di assistenza ispezionabili, senza invio automatico.
- Windows: player desktop, vista immersiva e mini-player. Android: interfaccia touch, riproduzione nativa Media3 e controlli di sistema.

Italiano e inglese disponibili nelle impostazioni; metadati e testi mantengono la lingua originale. Alcune funzioni differiscono tra le piattaforme. Nessun account cloud, sincronizzazione tra dispositivi, download audio offline o collaborazione social in tempo reale. [Guida alle funzioni](docs/FEATURES.md).

## Download

Non servono Node.js, Python, chiavi API o account RITVIO per usare i pacchetti.

<!-- downloads:start -->
| Piattaforma | Download |
| --- | --- |
| Windows 10/11 x64 | [Installer](https://github.com/salvo13200/RITVIO/releases/download/windows-v1.0.0/RITVIO-1.0.0-setup.exe) · [ZIP da estrarre una volta](https://github.com/salvo13200/RITVIO/releases/download/windows-v1.0.0/RITVIO-1.0.0-portatile.zip) · [EXE autoestraente](https://github.com/salvo13200/RITVIO/releases/download/windows-v1.0.0/RITVIO-1.0.0-portatile.exe) |
| Android 7.0+ ARM64/x86_64 | [APK firmata](https://github.com/salvo13200/RITVIO/releases/download/android-v1.4.0/RITVIO-Android-1.4.0.apk) |
<!-- downloads:end -->

Aggiorna sopra l'installazione ufficiale esistente senza disinstallare per conservare i dati locali. Gli EXE Windows non hanno firma Authenticode e possono attivare SmartScreen. Per l'uso quotidiano scegli installer o ZIP: estrai lo ZIP interamente e avvia `RITVIO.exe`, mantenendo insieme tutti i file. L'EXE autoestraente continua a estrarsi a ogni avvio e può partire lentamente. Tutti i formati Windows usano il profilo locale esistente. Una APK con firma diversa non può aggiornare l'app ufficiale. [Sorgenti e checksum](https://github.com/salvo13200/RITVIO/releases).

## Community

[Entra nel Discord di RITVIO](https://discord.gg/hCMwUtWZuM) per aggiornamenti, assistenza, suggerimenti e scoperte musicali. Durante l'accoglienza puoi scegliere Android, Windows o entrambe le piattaforme.

Per bug riproducibili e richieste di nuove funzioni usa [le issue GitHub](https://github.com/salvo13200/RITVIO/issues), così le segnalazioni restano facili da seguire. Per vulnerabilità consulta [SECURITY.md](SECURITY.md).

## Documentazione e contributi

[Indice della documentazione](docs/README.md) · [Compilazione](docs/BUILDING.md) · [Architettura](docs/ARCHITECTURE.md) · [Test](docs/TESTING.md) · [Contributi](CONTRIBUTING.md).

La documentazione tecnica e la galleria sono in inglese. Per segnalare un problema usa [le issue](https://github.com/salvo13200/RITVIO/issues) con versione, dispositivo e passaggi per riprodurlo. Il proprietario gestisce i merge; chiunque può proporre una PR da fork. Per vulnerabilità consulta [SECURITY.md](SECURITY.md).

## Privacy e licenze

La libreria resta locale; ricerca, streaming, copertine, metadati e testi contattano servizi esterni. Resolver non ufficiali, fonti e limiti sono descritti in **Impostazioni → Fonti e attribuzioni**, nel [README inglese](README.md#privacy-sources-and-licence) e in [PRIVACY.md](PRIVACY.md).

Sorgente originale sotto **GPL-3.0-only**: [licenza](LICENSE), [avvisi delle dipendenze e origine delle immagini](THIRD_PARTY_NOTICES.md). La licenza software non concede diritti su musica, testi, copertine o marchi dei provider.

## Sostieni lo sviluppo

Le donazioni sono facoltative e non sbloccano funzioni: [PayPal](https://www.paypal.me/sals126) · [Buy Me a Coffee](https://buymeacoffee.com/Sals126). I pagamenti sono gestiti dai provider e possono prevedere commissioni. Non sono presenti pagamenti nelle app.
