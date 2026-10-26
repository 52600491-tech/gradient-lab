import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowRight, Check, ChevronRight, CircleHelp, Compass, Moon, Settings2, Sun, Waves, Upload, Image as ImageIcon, SlidersHorizontal } from "lucide-react";
import { useLabStore } from "./lib/store";

const chapters = [
  { id: 1, title: "Ảnh là gì?", detail: "Từ hình ảnh đến ma trận pixel", tag: "NỀN TẢNG" },
  { id: 2, title: "Địa hình sáng tối", detail: "Biến độ sáng thành độ cao", tag: "TRỰC QUAN" },
  { id: 3, title: "Gradient tại một pixel", detail: "Đo độ dốc bằng một vector", tag: "TRỌNG TÂM" },
  { id: 4, title: "Kernel quét ảnh", detail: "Sobel và những khuôn mẫu nhỏ", tag: "THỰC HÀNH" },
  { id: 5, title: "Biên hiện ra", detail: "Độ lớn, ngưỡng và histogram", tag: "KHÁM PHÁ" },
  { id: 6, title: "Sobel vs Canny", detail: "Từ biên thô đến biên tinh", tag: "MỞ RỘNG" },
];

type LabResults = { original: string; gray: string; gx: string; gy: string; combined: string; edges: string; width: number; height: number };

function App() {
  const { theme, toggleTheme, completed, markCompleted } = useLabStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [threshold, setThreshold] = useState(80);
  const [results, setResults] = useState<LabResults | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeChapter, setActiveChapter] = useState<number | null>(null);

  const loadImageFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Vui lòng chọn tệp ảnh."); return; }
    if (file.size > 15 * 1024 * 1024) { alert("Ảnh tối đa 15 MB."); return; }
    setImageUrl(URL.createObjectURL(file));
    setImageName(file.name);
    setResults(null);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!imageUrl) { setResults(null); setProcessing(false); return; }
    let cancelled = false;
    setProcessing(true);
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const scale = Math.min(1, 1000 / img.naturalWidth, 700 / img.naturalHeight);
      const width = Math.max(1, Math.round(img.naturalWidth * scale));
      const height = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setProcessing(false); return; }
      ctx.drawImage(img, 0, 0, width, height);
      const original = canvas.toDataURL("image/png");
      const source = ctx.getImageData(0, 0, width, height);
      const gray = new Uint8ClampedArray(width * height);
      for (let i = 0; i < width * height; i++) gray[i] = Math.round(.299 * source.data[i * 4] + .587 * source.data[i * 4 + 1] + .114 * source.data[i * 4 + 2]);
      const grayCanvas = document.createElement("canvas"); grayCanvas.width = width; grayCanvas.height = height;
      const grayCtx = grayCanvas.getContext("2d");
      if (!grayCtx) { setProcessing(false); return; }
      const grayData = grayCtx.createImageData(width, height);
      for (let i = 0; i < gray.length; i++) { grayData.data[i * 4] = gray[i]; grayData.data[i * 4 + 1] = gray[i]; grayData.data[i * 4 + 2] = gray[i]; grayData.data[i * 4 + 3] = 255; }
      grayCtx.putImageData(grayData, 0, 0);
      const gxK = [-1,0,1,-2,0,2,-1,0,1], gyK = [-1,-2,-1,0,0,0,1,2,1];
      const gxValues = new Float32Array(width * height), gyValues = new Float32Array(width * height), mags = new Float32Array(width * height);
      let maxGx = 1, maxGy = 1, maxMag = 1;
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0, k = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++, k++) { const v = gray[(y + dy) * width + x + dx]; gx += v * gxK[k]; gy += v * gyK[k]; }
        const i = y * width + x, m = Math.hypot(gx, gy);
        gxValues[i] = Math.abs(gx); gyValues[i] = Math.abs(gy); mags[i] = m;
        if (Math.abs(gx) > maxGx) maxGx = Math.abs(gx); if (Math.abs(gy) > maxGy) maxGy = Math.abs(gy); if (m > maxMag) maxMag = m;
      }
      const gxCanvas = document.createElement("canvas"); gxCanvas.width = width; gxCanvas.height = height;
      const gyCanvas = document.createElement("canvas"); gyCanvas.width = width; gyCanvas.height = height;
      const combinedCanvas = document.createElement("canvas"); combinedCanvas.width = width; combinedCanvas.height = height;
      const edgeCanvas = document.createElement("canvas"); edgeCanvas.width = width; edgeCanvas.height = height;
      const gxCtx = gxCanvas.getContext("2d"), gyCtx = gyCanvas.getContext("2d"), combinedCtx = combinedCanvas.getContext("2d"), edgeCtx = edgeCanvas.getContext("2d");
      if (!gxCtx || !gyCtx || !combinedCtx || !edgeCtx) { setProcessing(false); return; }
      const gxd = gxCtx.createImageData(width, height), gyd = gyCtx.createImageData(width, height), cd = combinedCtx.createImageData(width, height), ed = edgeCtx.createImageData(width, height);
      for (let i = 0; i < mags.length; i++) {
        const xValue = Math.round(gxValues[i] / maxGx * 255), yValue = Math.round(gyValues[i] / maxGy * 255), magnitude = Math.round(mags[i] / maxMag * 255);
        for (const [data, value] of [[gxd.data, xValue], [gyd.data, yValue], [cd.data, magnitude]] as [Uint8ClampedArray, number][]) {
          data[i * 4] = value; data[i * 4 + 1] = value; data[i * 4 + 2] = value; data[i * 4 + 3] = 255;
        }
        const edge = magnitude >= threshold ? 255 : 0; ed.data[i*4] = edge; ed.data[i*4+1] = edge; ed.data[i*4+2] = edge; ed.data[i*4+3] = 255;
      }
      gxCtx.putImageData(gxd, 0, 0); gyCtx.putImageData(gyd, 0, 0); combinedCtx.putImageData(cd, 0, 0); edgeCtx.putImageData(ed, 0, 0);
      if (!cancelled) { setResults({ original, gray: grayCanvas.toDataURL("image/png"), gx: gxCanvas.toDataURL("image/png"), gy: gyCanvas.toDataURL("image/png"), combined: combinedCanvas.toDataURL("image/png"), edges: edgeCanvas.toDataURL("image/png"), width, height }); setProcessing(false); }
    };
    img.onerror = () => { if (!cancelled) { alert("Không thể đọc ảnh này. Hãy thử ảnh JPG hoặc PNG khác."); setProcessing(false); } };
    img.src = imageUrl;
    return () => { cancelled = true; };
  }, [imageUrl, threshold]);

  const jumpTo = (id: number) => {
    document.getElementById(`chapter-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Gradient Lab trang đầu">
          <span className="brand-mark"><Waves size={19} /></span>
          <span>gradient<span className="brand-light">lab</span><sup>®</sup></span>
        </a>
        <div className="top-actions">
          <span className="edition"><span className="live-dot" /> PHÒNG THÍ NGHIỆM TƯƠNG TÁC</span>
          <button className="icon-button" onClick={toggleTheme} aria-label="Đổi giao diện" title="Đổi giao diện">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button className="icon-button" aria-label="Thông tin dự án" title="Thông tin dự án" onClick={() => alert("Gradient Lab — học ảnh số bằng trực giác.")}><CircleHelp size={17} /></button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="side-caption">HÀNH TRÌNH CỦA BẠN</div>
        <div className="progress-row"><span>Tiến trình</span><strong>{Math.round(completed.length / 6 * 100)}%</strong></div>
        <div className="progress-track"><span style={{ width: `${completed.length / 6 * 100}%` }} /></div>
        <nav className="chapter-nav" aria-label="Các chương">
          {chapters.map((chapter) => (
            <button className="nav-chapter" key={chapter.id} onClick={() => jumpTo(chapter.id)}>
              <span className={`nav-number ${completed.includes(chapter.id) ? "is-done" : ""}`}>
                {completed.includes(chapter.id) ? <Check size={14} /> : String(chapter.id).padStart(2, "0")}
              </span>
              <span className="nav-copy"><strong>{chapter.title}</strong><small>{chapter.detail}</small></span>
              <ChevronRight size={15} className="nav-chevron" />
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="badge-icon">✦</div>
          <div><strong>Huy hiệu khám phá</strong><small>{completed.length ? `${completed.length}/6 chương đã hoàn thành` : "Bắt đầu hành trình để mở khóa"}</small></div>
        </div>
      </aside>

      <section className="hero" id="top">
        <div className="hero-orb orb-one" /><div className="hero-orb orb-two" /><div className="hero-orb orb-three" />
        <div className="hero-content">
          <motion.div className="eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7 }}>
            <span className="eyebrow-line" /> THỊ GIÁC MÁY TÍNH, BẮT ĐẦU TỪ NHỮNG ĐIỀU NHỎ NHẤT
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .8, delay: .1 }}>
            Máy tính nhìn<br />biên <span className="gradient-word">như thế nào?</span>
          </motion.h1>
          <motion.p className="hero-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .7, delay: .25 }}>
            Một hành trình trực quan qua 6 chương để khám phá Gradient —<br className="desktop-break" />
            từ một pixel nhỏ đến Sobel và Canny.
          </motion.p>
          <motion.div className="hero-buttons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .35 }}>
            <button className="primary-button" onClick={() => jumpTo(1)}>Bắt đầu hành trình <ArrowRight size={17} /></button>
            <button className="secondary-button" onClick={() => jumpTo(1)}>Tự do khám phá <ArrowDown size={16} /></button>
          </motion.div>
          <div className="hero-footnote"><span className="mini-spark">✳</span> Không cần kiến thức xử lý ảnh trước đó <span className="foot-dot">·</span> Khoảng 10 phút</div>
        </div>
        <div className="hero-visual" aria-label="Minh họa gradient và đường biên">
          <div className="visual-label label-top"><span className="label-dot" /> CƯỜNG ĐỘ SÁNG <span className="mono">I(x,y)</span></div>
          <div className="visual-grid">
            <div className="grid-glow" />
            {Array.from({ length: 11 }, (_, y) => Array.from({ length: 13 }, (_, x) => {
              const edge = x > 6 + Math.sin(y * .7) * 1.2;
              const shade = edge ? 235 - y * 3 : 30 + x * 4 + y * 2;
              return <span key={`${x}-${y}`} style={{ background: `rgb(${shade},${shade},${Math.min(255, shade + (edge ? 5 : 20))})`, opacity: .5 + ((x * 7 + y * 3) % 5) * .1 }} />;
            }))}
            <svg className="vector-overlay" viewBox="0 0 520 360" role="img" aria-label="Các vector gradient vuông góc với biên">
              <defs><linearGradient id="line" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#818cf8" /><stop offset="100%" stopColor="#f472b6" /></linearGradient></defs>
              <path d="M 290 22 C 255 90, 330 130, 286 190 S 326 275, 292 340" fill="none" stroke="url(#line)" strokeWidth="2" strokeDasharray="4 7" opacity=".8" />
              {[55,110,165,220,275,320].map((y,i) => <g key={y} transform={`translate(${i%2===0?305:295} ${y}) rotate(${i%2===0?90:88})`}><path d="M -23 0 L 23 0 M 14 -6 L 23 0 L 14 6" stroke="#f9a8d4" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>)}
            </svg>
          </div>
          <div className="visual-label label-bottom"><span>GRADIENT FIELD</span><span className="visual-coordinate">G = (Gx, Gy)</span></div>
          <div className="float-card"><span className="float-icon"><Compass size={17} /></span><div><small>ĐỘ LỚN GRADIENT</small><strong>|G| <span>→</span> Biên</strong></div><div className="float-bars">{[8,13,10,19,15,25,17,30,23,36,28,42].map((h,i)=><i key={i} style={{height:h}} />)}</div></div>
        </div>
        <div className="hero-bottom"><span>01 / 06</span><span className="scroll-line" /><span>CUỘN ĐỂ KHÁM PHÁ</span></div>
      </section>

      <section className="intro-strip">
        <div><span className="strip-number">01</span><span>Trực quan trước</span></div>
        <div><span className="strip-number">02</span><span>Thực hành từng bước</span></div>
        <div><span className="strip-number">03</span><span>Hiểu bản chất, không học vẹt</span></div>
      </section>

      <section className="chapters-area">
        <div className="section-heading">
          <div className="eyebrow"><span className="eyebrow-line" /> BẢN ĐỒ KHÁM PHÁ</div>
          <h2>Sáu chương. Một trực giác mới.</h2>
          <p>Mỗi chặng bắt đầu bằng một câu hỏi. Hãy khám phá theo thứ tự hoặc chọn điều khiến bạn tò mò nhất.</p>
        </div>
        <div className="chapter-cards">
          {chapters.map((chapter, index) => (
            <motion.article id={`chapter-${chapter.id}`} key={chapter.id} className={`chapter-card card-${chapter.id}`} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .18 }} transition={{ duration: .45, delay: index * .04 }}>
              <div className="card-topline"><span>{chapter.tag}</span><span className="card-index">{String(chapter.id).padStart(2, "0")}</span></div>
              <div className={`chapter-art art-${chapter.id}`} aria-hidden="true">
                {chapter.id === 1 && <div className="pixel-art">{Array.from({length:64},(_,i)=><i key={i} style={{opacity:.15+((i*13)%9)/10,background:(i%8>4)? "#e5e7eb":"#6366f1"}} />)}</div>}
                {chapter.id === 2 && <div className="terrain-art"><div className="terrain-plane" /><span className="terrain-axis x-axis">x</span><span className="terrain-axis y-axis">y</span><span className="terrain-axis z-axis">I(x,y)</span></div>}
                {chapter.id === 3 && <div className="vector-art"><span className="vector-center" /><i className="vec vx" /><i className="vec vy" /><i className="vec vd" /><span className="vlabel">G = (Gx, Gy)</span></div>}
                {chapter.id === 4 && <div className="kernel-art">{[-1,0,1,-2,0,2,-1,0,1].map((v,i)=><span key={i} className={v<0?"negative":v>0?"positive":""}>{v}</span>)}</div>}
                {chapter.id === 5 && <div className="threshold-art"><div className="threshold-image" /><div className="threshold-line" /><div className="threshold-edge" /></div>}
                {chapter.id === 6 && <div className="canny-art"><div className="canny-before" /><div className="canny-divider" /><div className="canny-after" /></div>}
              </div>
              <div className="card-copy"><h3>{chapter.title}</h3><p>{chapter.detail}</p></div>
              <div className="card-bottom">
                <button onClick={() => { setActiveChapter(chapter.id); markCompleted(chapter.id); }} className="card-open">{completed.includes(chapter.id) ? "Xem lại chương" : "Khám phá chương"} <ArrowRight size={15} /></button>
                {completed.includes(chapter.id) && <span className="done-mark"><Check size={14} /></span>}
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="image-lab" id="image-lab">
        <div className="section-heading">
          <div className="eyebrow"><span className="eyebrow-line" /> THỰC HÀNH TRÊN ẢNH CỦA BẠN</div>
          <h2>Đưa một bức ảnh vào phòng thí nghiệm.</h2>
          <p>Tải ảnh lên để xem ảnh xám, độ lớn Gradient theo Sobel và kết quả phát hiện biên. Toàn bộ xử lý diễn ra ngay trong trình duyệt.</p>
        </div>
        <input
          ref={fileInputRef}
          className="file-input-hidden"
          type="file"
          accept="image/*"
          onChange={(event) => loadImageFile(event.target.files?.[0])}
        />
        {!imageUrl ? (
          <button
            className="upload-dropzone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); loadImageFile(event.dataTransfer.files?.[0]); }}
          >
            <span className="upload-icon"><Upload size={25} /></span>
            <strong>Kéo ảnh vào đây hoặc chọn từ máy tính</strong>
            <span>Hỗ trợ JPG, PNG, WEBP · tối đa 15 MB</span>
            <span className="primary-button upload-cta">Chọn ảnh <ArrowRight size={15} /></span>
          </button>
        ) : (
          <div className="lab-workspace">
            <div className="lab-toolbar">
              <div className="lab-file-info"><span className="lab-file-icon"><ImageIcon size={17} /></span><div><strong>{imageName}</strong><small>{results ? `${results.width} × ${results.height} px` : "Đang đọc ảnh..."}</small></div></div>
              <button className="secondary-button" onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Đổi ảnh</button>
              <button className="secondary-button" onClick={() => { setImageUrl(""); setImageName(""); setResults(null); }}>Xóa ảnh</button>
            </div>
            {processing && <div className="processing-note"><span className="live-dot" /> Đang tính grayscale và Sobel…</div>}
            {results && <>
              <div className="lab-results-grid">
                <div className="result-tile"><div className="result-heading"><span>01</span><strong>Ảnh gốc</strong></div><img src={results.original} alt="Ảnh gốc đã tải lên" /></div>
                <div className="result-tile"><div className="result-heading"><span>02</span><strong>Sobel X (Gx)</strong></div><img src={results.gx} alt="Độ lớn gradient theo hướng X" /></div>
                <div className="result-tile"><div className="result-heading"><span>03</span><strong>Sobel Y (Gy)</strong></div><img src={results.gy} alt="Độ lớn gradient theo hướng Y" /></div>
                <div className="result-tile"><div className="result-heading"><span>04</span><strong>Sobel Combined (G)</strong></div><img src={results.combined} alt="Độ lớn gradient kết hợp Gx và Gy" /></div>
              </div>
              <div className="result-tile edge-result"><div className="result-heading"><span>05</span><strong>Ảnh biên nhị phân</strong></div><img src={results.edges} alt="Ảnh biên nhị phân sau áp dụng ngưỡng" /></div>
              <div className="threshold-control">
                <div className="threshold-title"><div><SlidersHorizontal size={17} /><strong>Điều chỉnh ngưỡng phát hiện biên</strong></div><output>{threshold}</output></div>
                <input aria-label="Ngưỡng Gradient" type="range" min="5" max="240" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
                <div className="threshold-labels"><span>Ngưỡng thấp · giữ nhiều biên</span><span>Ngưỡng cao · chỉ giữ biên mạnh</span></div>
                <p><strong>Quan sát:</strong> Khi tăng ngưỡng, những pixel có độ lớn Gradient thấp sẽ bị loại bỏ. Chỉ pixel có giá trị Gradient lớn hơn hoặc bằng ngưỡng mới hiện màu trắng trong ảnh biên.</p>
              </div>
            </>}
          </div>
        )}
        <div className="lab-insight"><span>✦</span><p><strong>Điều cần nhớ:</strong> Gradient không trực tiếp “nhìn thấy đường viền”. Nó đo sự thay đổi độ sáng; sau đó ta dùng độ lớn Gradient và ngưỡng để chọn các điểm có khả năng thuộc biên.</p></div>
      </section>

      <section className="closing">
        <div className="closing-glow" />
        <span className="eyebrow"><span className="eyebrow-line" /> MỌI ĐƯỜNG BIÊN ĐỀU BẮT ĐẦU TỪ MỘT THAY ĐỔI</span>
        <h2>Đừng chỉ nhìn ảnh.<br /><span className="gradient-word">Hãy nhìn cách máy tính thấy ảnh.</span></h2>
        <button className="primary-button" onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); }}>Quay lại từ đầu <ArrowRight size={17} /></button>
      </section>
      <footer><a className="brand" href="#top"><span className="brand-mark"><Waves size={17} /></span><span>gradient<span className="brand-light">lab</span><sup>®</sup></span></a><span>HỌC ẢNH SỐ BẰNG TRỰC GIÁC</span><span>Được thiết kế để hiểu, không chỉ để ghi nhớ.</span></footer>
      {activeChapter !== null && (() => {
        const lessons: Record<number, {subtitle:string; idea:string; points:string[]; formula:string; action:string}> = {
          1: { subtitle: "Từ hình ảnh đến ma trận pixel", idea: "Máy tính không nhìn ảnh như con người. Ảnh raster là lưới pixel; mỗi pixel lưu giá trị màu hoặc độ sáng.", points: ["Ảnh RGB thường có ba kênh: đỏ (R), lục (G), lam (B).", "Ảnh xám lưu một giá trị cường độ sáng cho mỗi pixel, thường từ 0 đến 255.", "Tọa độ ảnh được xác định bằng hàng y và cột x; ảnh số có kích thước chiều rộng × chiều cao."], formula: "Gray = 0.299R + 0.587G + 0.114B", action: "Tải ảnh ở khu vực thực hành để xem ảnh gốc và kết quả xử lý." },
          2: { subtitle: "Biến độ sáng thành địa hình", idea: "Hãy xem cường độ sáng như độ cao của một bề mặt: vùng sáng là đỉnh cao, vùng tối là vùng thấp.", points: ["Trục x biểu diễn vị trí theo chiều ngang; trục y biểu diễn vị trí theo chiều dọc.", "Giá trị I(x,y) là độ sáng tại pixel ở vị trí (x,y).", "Nơi bề mặt thay đổi nhanh tương ứng với nơi độ sáng thay đổi mạnh trong ảnh."], formula: "I = I(x, y)", action: "Dùng ảnh thực hành và quan sát những vùng có chuyển tiếp sáng–tối rõ." },
          3: { subtitle: "Đo độ dốc bằng một vector", idea: "Gradient mô tả mức độ và hướng thay đổi của độ sáng tại một vị trí trong ảnh.", points: ["Gx đo thay đổi theo hướng x (trái–phải).", "Gy đo thay đổi theo hướng y (trên–dưới).", "Vector Gradient vuông góc với đường đồng mức độ sáng; hướng của nó chỉ chiều tăng sáng nhanh nhất."], formula: "∇I = (Gx, Gy)", action: "Tải ảnh lên để so sánh riêng kết quả Sobel X và Sobel Y." },
          4: { subtitle: "Kernel quét ảnh", idea: "Kernel là một ma trận hệ số nhỏ trượt qua ảnh. Ở mỗi vị trí, hệ số được nhân với pixel lân cận rồi cộng lại để ước lượng đạo hàm.", points: ["Kernel Sobel thường có kích thước 3×3.", "Gx nhấn mạnh thay đổi trái–phải; Gy nhấn mạnh thay đổi trên–dưới.", "Các hệ số âm và dương tạo phép so sánh giữa hai phía của vùng lân cận."], formula: "Gx = Kx * I     Gy = Ky * I", action: "Xem và nhấn các ô trong hai ma trận Sobel ở phần giải thích Gradient." },
          5: { subtitle: "Độ lớn, ngưỡng và ảnh biên", idea: "Độ lớn Gradient kết hợp thông tin từ hai hướng. Ngưỡng biến bản đồ độ lớn thành quyết định pixel nào được giữ làm biên.", points: ["Độ lớn lớn thường cho biết độ sáng thay đổi mạnh.", "Ngưỡng thấp giữ nhiều điểm hơn nhưng có thể giữ cả nhiễu.", "Ngưỡng cao chỉ giữ những thay đổi mạnh, nhưng có thể làm mất biên yếu."], formula: "|G| = √(Gx² + Gy²)", action: "Tải ảnh lên rồi kéo thanh ngưỡng để quan sát ảnh biên nhị phân thay đổi." },
          6: { subtitle: "Từ biên thô đến biên tinh", idea: "Sobel ước lượng gradient; Canny là quy trình phát hiện biên nhiều bước nhằm tạo đường biên mảnh và liên tục hơn.", points: ["Làm mượt ảnh để giảm nhiễu trước khi tính gradient.", "Non-maximum suppression giữ các điểm cực đại cục bộ để làm mảnh biên.", "Ngưỡng kép và hysteresis giữ biên mạnh cùng các biên yếu có liên kết với biên mạnh."], formula: "Canny: Smooth → Gradient → NMS → Double threshold → Hysteresis", action: "So sánh kết quả Sobel và Canny trên cùng một ảnh; bản hiện tại minh họa quy trình Canny bằng lý thuyết." }
        };
        const lesson = lessons[activeChapter];
        const chapter = chapters.find(item => item.id === activeChapter);
        if (!lesson || !chapter) return null;
        return <div className="lesson-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveChapter(null); }}><section className="lesson-dialog" role="dialog" aria-modal="true" aria-labelledby="lesson-dialog-title"><button className="lesson-close" onClick={() => setActiveChapter(null)} aria-label="Đóng bài học">×</button><span className="eyebrow"><span className="eyebrow-line" /> CHƯƠNG {String(chapter.id).padStart(2,"0")} · BÀI HỌC TƯƠNG TÁC</span><h2 id="lesson-dialog-title">{chapter.title}</h2><h3>{lesson.subtitle}</h3><p className="lesson-idea">{lesson.idea}</p><ul>{lesson.points.map((point, index) => <li key={index}>{point}</li>)}</ul><div className="lesson-formula"><span>CÔNG THỨC / Ý CHÍNH</span><strong>{lesson.formula}</strong></div><p className="lesson-action">{lesson.action}</p><div className="lesson-dialog-actions"><button className="secondary-button" onClick={() => setActiveChapter(activeChapter === 1 ? 6 : activeChapter - 1)} disabled={activeChapter === 1}>← Chương trước</button><button className="primary-button" onClick={() => { const next = activeChapter === 6 ? 1 : activeChapter + 1; setActiveChapter(next); markCompleted(chapter.id); }}>Chương tiếp theo <ArrowRight size={15}/></button><button className="secondary-button" onClick={() => { setActiveChapter(null); document.getElementById("image-lab")?.scrollIntoView({behavior:"smooth",block:"start"}); }}>Thực hành ảnh <ImageIcon size={15}/></button></div></section></div>;
      })()}
      <button className="settings-fab" title="Cài đặt giao diện" aria-label="Cài đặt giao diện" onClick={toggleTheme}><Settings2 size={19} /></button>
    </main>
  );
}

export default App;