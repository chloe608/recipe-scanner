import React, { useState, useRef } from 'react';
import html2pdf from 'html2pdf.js';

export default function RecipeExtractor() {
  const [url, setUrl] = useState('');
  const [htmlFile, setHtmlFile] = useState(null);
  const [recipe, setRecipe] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const outputRef = useRef();

  function decodeHtml(str) {
    if (!str || typeof str !== 'string') return str;
    try {
      const doc = new DOMParser().parseFromString(str, 'text/html');
      return doc.documentElement.textContent;
    } catch (e) {
      return str;
    }
  }

  function reset() {
    setRecipe(null);
    setError(null);
  }

  async function fetchAndExtract(fetchUrl) {
    reset();
    if (!fetchUrl) return;
    setIsLoading(true);
    try {
      const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(fetchUrl);
      const res = await fetch(proxy);
      if (!res.ok) throw new Error('Failed to fetch URL');
      const text = await res.text();
      extractFromHtml(text);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setIsLoading(false);
    }
  }

  function handleFile(e) {
    reset();
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setHtmlFile(f.name);
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        extractFromHtml(ev.target.result);
      } catch (err) {
        setError(String(err));
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = (err) => {
      setError('Failed to read file');
      setIsLoading(false);
    };
    reader.readAsText(f);
  }

  function extractFromHtml(htmlString) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');

      const ld = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
        .map((s) => s.textContent)
        .map((t) => {
          try { return JSON.parse(t); } catch { return null; }
        })
        .flatMap((v) => v ? (Array.isArray(v) ? v : [v]) : [])
        .find((obj) => obj && (obj['@type'] === 'Recipe' || (Array.isArray(obj['@type']) && obj['@type'].includes('Recipe'))));

      if (ld) {
        const title = decodeHtml(ld.name || ld.headline || '');
        const ingredients = (ld.recipeIngredient || ld.ingredients || []).map(i => decodeHtml(i));
        let directions = [];
        if (ld.recipeInstructions) {
          if (Array.isArray(ld.recipeInstructions)) {
            directions = ld.recipeInstructions.map((ri) => {
              const val = typeof ri === 'string' ? ri : (ri.text || ri.name || '');
              return decodeHtml(val);
            }).filter(Boolean);
          } else if (typeof ld.recipeInstructions === 'string') {
            directions = [decodeHtml(ld.recipeInstructions)];
          }
        }
        let image = null;
        if (ld.image) {
          if (typeof ld.image === 'string') image = ld.image;
          else if (Array.isArray(ld.image) && ld.image.length) image = ld.image[0];
          else if (ld.image.url) image = ld.image.url;
        }
        setRecipe({ title, ingredients, directions, image });
        return;
      }

  const title = decodeHtml((doc.querySelector('[itemprop="name"], .recipe-title, .entry-title, h1') || {}).textContent || '');
  const ingredientsNodes = doc.querySelectorAll('[itemprop="recipeIngredient"], .ingredient, .ingredients li, .ingredients p');
  const ingredients = Array.from(ingredientsNodes).map(n => decodeHtml(n.textContent.trim())).filter(Boolean);

  const directionsNodes = doc.querySelectorAll('[itemprop="recipeInstructions"], .instructions li, .directions li, .instructions p, .steps li');
  const directions = Array.from(directionsNodes).map(n => decodeHtml(n.textContent.trim())).filter(Boolean);

  if (!title && ingredients.length === 0 && directions.length === 0) {
        const srTitle = doc.querySelector('.entry-header__title') || doc.querySelector('.heading__title') || doc.querySelector('h1');
        const srIngredients = doc.querySelectorAll('.ingredient, .recipe-ingredients li, .ingredients__item');
        const srDirections = doc.querySelectorAll('.direction, .instructions__item, .recipe-directions__step');
          const sTitle = srTitle ? decodeHtml(srTitle.textContent.trim()) : '';
          const sIngredients = Array.from(srIngredients).map(n => decodeHtml(n.textContent.trim())).filter(Boolean);
          const sDirections = Array.from(srDirections).map(n => decodeHtml(n.textContent.trim())).filter(Boolean);

        if (sTitle || sIngredients.length || sDirections.length) {
          const imgNode = doc.querySelector('.featured-image img, .lead-media img, figure img, .post-media img, .photo img, .recipe-media img');
          const sImage = imgNode ? (imgNode.src || imgNode.getAttribute('data-src') || null) : null;
          setRecipe({ title: sTitle, ingredients: sIngredients, directions: sDirections, image: sImage });
          return;
        }
      }

      let image = null;
      const og = doc.querySelector('meta[property="og:image"], meta[name="og:image"]');
      if (og && og.content) image = og.content;
      const tw = doc.querySelector('meta[name="twitter:image"], meta[property="twitter:image"]');
      if (!image && tw && tw.content) image = tw.content;
      if (!image) {
        const firstImg = doc.querySelector('img');
        if (firstImg) image = firstImg.src || firstImg.getAttribute('data-src') || null;
      }

      setRecipe({ title: title.trim(), ingredients, directions, image });
    } catch (e) {
      setError(String(e));
    }
  }

  async function downloadPdf() {
    if (!outputRef.current) return;
    const imgEl = outputRef.current.querySelector('.cover-image');
    if (imgEl && imgEl.src && !imgEl.src.startsWith('data:')) {
      try {
        const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(imgEl.src);
        const resp = await fetch(proxy);
        if (resp.ok) {
          const blob = await resp.blob();
          const dataUrl = await new Promise((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.readAsDataURL(blob);
          });
          imgEl.src = dataUrl;
        }
      } catch (e) {
      }
    }

    const filename = (recipe && recipe.title ? recipe.title.replace(/\s+/g,'_') : 'recipe') + '.pdf';
    const opt = {
      margin: [10, 10, 10, 10],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, allowTaint: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    };

    await html2pdf().set(opt).from(outputRef.current).save();
  }

  return (
    <div className="recipe-extractor">
      <h1>Recipe Scanner</h1>
      <div className="controls">
        <input placeholder="Enter page URL" value={url} onChange={(e)=>setUrl(e.target.value)} disabled={isLoading} />
        <button onClick={()=>fetchAndExtract(url)} disabled={!url || isLoading}>Fetch</button>
        <span className="or">or</span>
        <input type="file" accept=".html,.htm,text/html" onChange={handleFile} disabled={isLoading} />
      </div>

      {isLoading && (
        <div className="loading">
          <div className="spinner" aria-hidden="true"></div>
          <div className="loading-text">Loading…</div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {recipe && (
        <div className="result pdf-layout" ref={outputRef}>
          {recipe.image && (
            // eslint-disable-next-line jsx-a11y/img-redundant-alt
            <img className="cover-image" src={recipe.image} alt={recipe.title ? recipe.title + ' image' : 'recipe image'} />
          )}
          <h2 className="recipe-title">{recipe.title}</h2>
          {recipe.ingredients && recipe.ingredients.length>0 && (
            <div>
              <h3>Ingredients:</h3>
              <ul>
                {recipe.ingredients.map((ing, i)=>(<li key={i}>{ing}</li>))}
              </ul>
            </div>
          )}
          {recipe.directions && recipe.directions.length>0 && (
            <div>
              <h3>Directions:</h3>
              {recipe.directions.map((d, i)=>(<p key={i}>{d}</p>))}
            </div>
          )}
        </div>
      )}

      {recipe && (
        <div className="actions">
          <button onClick={downloadPdf}>Download PDF</button>
          <button onClick={()=>{ setRecipe(null); setHtmlFile(null); setUrl(''); }}>Clear</button>
        </div>
      )}

    </div>
  );
}
