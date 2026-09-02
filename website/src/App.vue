<script setup>
import brandWordmarkUrl from "./assets/yamlock-wordmark.svg";
import ConfigScanner from "./components/ConfigScanner.vue";
import { content } from "./content/en.js";

const version = import.meta.env.YAMLOCK_VERSION;
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>

  <header class="site-header">
    <a class="wordmark" href="/yamlock/">
      <img :src="brandWordmarkUrl" alt="yamlock" />
    </a>
    <span class="release">v{{ version }} / stable</span>
    <nav aria-label="Primary navigation">
      <a href="#mechanism">Mechanism</a>
      <a href="#install">Install</a>
      <a href="https://github.com/phoenixweiss/yamlock">GitHub ↗</a>
    </nav>
  </header>

  <main id="main">
    <section class="hero">
      <div class="hero-copy">
        <p class="kicker">Value-level encryption / YAML + JSON</p>
        <h1>Plaintext<br />ends <span class="accent">here.</span></h1>
        <p class="hero-lead">
          Move the beam. Selected values become path-bound authenticated
          payloads while your configuration keeps its shape.
        </p>
        <div class="hero-meta">
          <span>Node.js 22+</span>
          <span>Local process</span>
          <span>AES-256-GCM</span>
        </div>
      </div>

      <ConfigScanner />

      <div class="scroll-cue" aria-hidden="true">
        <span></span>
        Scroll to inspect the lock
      </div>
    </section>

    <section id="mechanism" class="manifesto">
      <p class="section-index">01 / mechanism</p>
      <p class="manifesto-line">
        The file stays <span class="accent">recognizable.</span><br />
        The sensitive values do not.
      </p>
      <p class="manifesto-note">
        yamlock is a local Node.js CLI and ESM library — not a hosted secrets
        service and not a new configuration format.
      </p>
    </section>

    <section class="principles">
      <article v-for="principle in content.principles" :key="principle.marker">
        <div class="principle-head">
          <span>{{ principle.marker }}</span>
          <code>{{ principle.example }}</code>
        </div>
        <div class="principle-copy">
          <h2>{{ principle.title }}</h2>
          <p>{{ principle.text }}</p>
        </div>
      </article>
    </section>

    <section class="security">
      <p class="section-index">02 / security boundary</p>
      <div class="security-grid">
        <h2>Authenticated<br /><span class="accent">by default.</span></h2>
        <p class="security-lead">
          v2 uses AES-256-GCM and scrypt with fresh cryptographic material. The
          field path and critical metadata are authenticated together with the
          ciphertext.
        </p>
        <div class="security-points">
          <p><span>01</span> Processing stays inside your Node.js process.</p>
          <p><span>02</span> Atomic CLI writes preserve file permissions.</p>
          <p><span>03</span> Legacy payloads remain readable throughout 1.x.</p>
        </div>
        <aside class="audit-note">
          <span>Audit status</span>
          <p>yamlock has not received a third-party security audit.</p>
          <a
            href="https://github.com/phoenixweiss/yamlock/blob/main/docs/design/payload-v2.md#threat-model"
          >
            Read the threat model ↗
          </a>
        </aside>
      </div>
    </section>

    <section id="install" class="install">
      <div class="install-heading">
        <p class="section-index">03 / start local</p>
        <h2>One package.<br /><span class="accent">Your key.</span></h2>
      </div>
      <div class="install-commands">
        <div>
          <span>install the CLI</span>
          <code>npm install -g yamlock</code>
        </div>
        <div>
          <span>generate a key</span>
          <code>yamlock keygen --length 64 --format base64</code>
        </div>
        <div>
          <span>preview changes</span>
          <code>yamlock encrypt config.yml -p db.password -d</code>
        </div>
      </div>
      <div class="install-links">
        <a href="https://github.com/phoenixweiss/yamlock#usage"
          >Read the usage guide ↗</a
        >
        <a href="https://www.npmjs.com/package/yamlock">Open npm ↗</a>
      </div>
    </section>
  </main>

  <footer>
    <a class="wordmark" href="/yamlock/">
      <img :src="brandWordmarkUrl" alt="yamlock" />
    </a>
    <span>MIT / phoenixweiss / v{{ version }}</span>
    <a href="https://github.com/phoenixweiss/yamlock">Source ↗</a>
  </footer>
</template>
