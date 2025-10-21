import React, { useState, useRef } from 'react';
import html2pdf from 'html2pdf.js';

export default function RecipeExtractor() {
  const [url, setUrl] = useState('');
  const [htmlFile, setHtmlFile] = useState(null);
  const [recipe, setRecipe] = useState(null);
  const [error, setError] = useState(null);
  const outputRef = useRef();

  function reset() {
    setRecipe(null);
    setError(null);
  }

  async function fetchAndExtract(fetchUrl) {
    reset();
    try {
      const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(fetchUrl);
      const res = await fetch(proxy);
      if (!res.ok) throw new Error('Failed to fetch URL');
      const text = await res.text();
      extractFromHtml(text);
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  function handleFile(e) {
    reset();
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setHtmlFile(f.name);
    const reader = new FileReader();
    reader.onload = (ev) => extractFromHtml(ev.target.result);
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
        const title = ld.name || ld.headline || '';
        const ingredients = ld.recipeIngredient || ld.ingredients || [];
        let directions = [];
        if (ld.recipeInstructions) {
          if (Array.isArray(ld.recipeInstructions)) {
            directions = ld.recipeInstructions.map((ri) => typeof ri === 'string' ? ri : (ri.text || ri.name || '')).filter(Boolean);
          } else if (typeof ld.recipeInstructions === 'string') {
            directions = [ld.recipeInstructions];
          }
        }
        setRecipe({ title, ingredients, directions });
        return;
      }

      const title = (doc.querySelector('[itemprop="name"], .recipe-title, .entry-title, h1') || {}).textContent || '';
      const ingredientsNodes = doc.querySelectorAll('[itemprop="recipeIngredient"], .ingredient, .ingredients li, .ingredients p');
      const ingredients = Array.from(ingredientsNodes).map(n => n.textContent.trim()).filter(Boolean);

      const directionsNodes = doc.querySelectorAll('[itemprop="recipeInstructions"], .instructions li, .directions li, .instructions p, .steps li');
      const directions = Array.from(directionsNodes).map(n => n.textContent.trim()).filter(Boolean);

      if (!title && ingredients.length === 0 && directions.length === 0) {
        const srTitle = doc.querySelector('.entry-header__title') || doc.querySelector('.heading__title') || doc.querySelector('h1');
        const srIngredients = doc.querySelectorAll('.ingredient, .recipe-ingredients li, .ingredients__item');
        const srDirections = doc.querySelectorAll('.direction, .instructions__item, .recipe-directions__step');
        const sTitle = srTitle ? srTitle.textContent.trim() : '';
        const sIngredients = Array.from(srIngredients).map(n => n.textContent.trim()).filter(Boolean);
        const sDirections = Array.from(srDirections).map(n => n.textContent.trim()).filter(Boolean);

        if (sTitle || sIngredients.length || sDirections.length) {
          setRecipe({ title: sTitle, ingredients: sIngredients, directions: sDirections });
          return;
        }
      }

      setRecipe({ title: title.trim(), ingredients, directions });
    } catch (e) {
      setError(String(e));
    }
  }

  function downloadPdf() {
    if (!outputRef.current) return;
    const opt = { margin: 10, filename: (recipe && recipe.title ? recipe.title.replace(/\s+/g,'_') : 'recipe') + '.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
    html2pdf().set(opt).from(outputRef.current).save();
  }

  return (
    <div className="recipe-extractor">
      <h1>Recipe Scanner</h1>
      <div className="controls">
        <input placeholder="Enter page URL" value={url} onChange={(e)=>setUrl(e.target.value)} />
        <button onClick={()=>fetchAndExtract(url)} disabled={!url}>Fetch</button>
        <span className="or">or</span>
        <input type="file" accept=".html,.htm,text/html" onChange={handleFile} />
      </div>

      {error && <div className="error">{error}</div>}

      {recipe && (
        <div className="result" ref={outputRef}>
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

      <div className="note">
        Tip: If a direct fetch fails due to CORS, the app uses a public proxy. For production, host a server-side scraper or enable CORS on the target.
      </div>
    </div>
  );
}
