const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'artworkscan2024';

const DATA_DIR = path.join(__dirname, 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const ARTWORKS_FILE = path.join(DATA_DIR, 'artworks.json');
const TARGETS_FILE = path.join(DATA_DIR, 'targets.mind');

fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(ARTWORKS_FILE)) fs.writeFileSync(ARTWORKS_FILE, '[]');

function getArtworks() {
  try { return JSON.parse(fs.readFileSync(ARTWORKS_FILE, 'utf-8')); }
  catch { return []; }
}

function saveArtworks(data) {
  fs.writeFileSync(ARTWORKS_FILE, JSON.stringify(data, null, 2));
}

// Auth middleware
function basicAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Artwork Scanner Admin"');
    return res.status(401).json({ error: 'Authorization required' });
  }
  const creds = Buffer.from(auth.split(' ')[1], 'base64').toString('utf-8');
  const [user, pass] = creds.split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  return res.status(403).json({ error: 'Invalid credentials' });
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.use(express.json({limit:"5mb"}));

// ---------- STATIC ----------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/data/images', express.static(IMAGES_DIR));
app.get('/data/targets.mind', (req, res) => {
  if (fs.existsSync(TARGETS_FILE)) return res.sendFile(TARGETS_FILE);
  res.status(404).json({ error: 'No targets file yet' });
});

// ---------- API ----------
app.get('/api/artworks', (req, res) => res.json(getArtworks()));

app.post('/api/artworks', basicAuth, upload.single('image'), async (req, res) => {
  try {
    const meta = JSON.parse(req.body.metadata);
    if (!meta.title || !meta.artist) return res.status(400).json({ error: 'Title and artist required' });

    const artworks = getArtworks();
    const id = 'werk-' + (artworks.length + 1);
    const ext = '.jpg';

    // Optimize image with sharp
    let buffer = req.file.buffer;
    try {
      buffer = await sharp(req.file.buffer)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch (sharpErr) {
      // Sharp failed, use original
      console.warn('Sharp failed, using original:', sharpErr.message);
    }

    const imageFile = id + ext;
    fs.writeFileSync(path.join(IMAGES_DIR, imageFile), buffer);

    const artwork = {
      id, mindIndex: artworks.length,
      title: meta.title, artist: meta.artist,
      year: meta.year || null, medium: meta.medium || '',
      dimensions: meta.dimensions || '', description: meta.description || '',
      imageFile
    };

    artworks.push(artwork);
    saveArtworks(artworks);
    res.json({ success: true, artwork, artworks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/artworks/:id', basicAuth, upload.single('image'), async (req, res) => {
  try {
    const artworks = getArtworks();
    const idx = artworks.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const meta = JSON.parse(req.body.metadata || '{}');
    if (meta.title) artworks[idx].title = meta.title;
    if (meta.artist) artworks[idx].artist = meta.artist;
    if (meta.year !== undefined) artworks[idx].year = meta.year;
    if (meta.medium !== undefined) artworks[idx].medium = meta.medium;
    if (meta.dimensions !== undefined) artworks[idx].dimensions = meta.dimensions;
    if (meta.description !== undefined) artworks[idx].description = meta.description;

    if (req.file) {
      try {
        const buffer = await sharp(req.file.buffer)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        fs.writeFileSync(path.join(IMAGES_DIR, artworks[idx].imageFile), buffer);
      } catch { fs.writeFileSync(path.join(IMAGES_DIR, artworks[idx].imageFile), req.file.buffer); }
    }

    saveArtworks(artworks);
    res.json({ success: true, artwork: artworks[idx], artworks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/artworks/:id', basicAuth, (req, res) => {
  const artworks = getArtworks();
  const idx = artworks.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  // Delete image file
  const imgPath = path.join(IMAGES_DIR, artworks[idx].imageFile);
  try { fs.unlinkSync(imgPath); } catch {}

  artworks.splice(idx, 1);
  // Don't touch mindIndex — user must recompile
  saveArtworks(artworks);
  res.json({ success: true, artworks });
});

app.post('/api/artworks/reorder', basicAuth, (req, res) => {
  try {
    const { order } = req.body; // array of IDs in new order
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });

    const artworks = getArtworks();
    const reordered = order.map((id, i) => {
      const a = artworks.find(w => w.id === id);
      if (!a) throw new Error('Invalid ID: ' + id);
      return { ...a, mindIndex: i };
    });

    saveArtworks(reordered);
    res.json({ success: true, artworks: reordered });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/targets', basicAuth, express.raw({ type: 'application/octet-stream', limit: '50mb' }), (req, res) => {
  try {
    fs.writeFileSync(TARGETS_FILE, req.body);
    res.json({ success: true, size: req.body.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log('Artwork Scanner on port ' + PORT));
