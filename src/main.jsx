import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Home,
  Users,
  Trophy,
  Footprints,
  Scale,
  Flame,
  Droplets,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Check,
  X,
  ChevronRight,
  Share2,
  Clock3,
  ShieldCheck,
  Leaf,
  Activity,
  Settings2,
  Download,
  Monitor,
  Pause,
  Play,
  Lock,
  LoaderCircle,
  Info,
  Search,
  Target,
  Maximize,
  ClipboardList,
  CalendarDays,
  Mountain,
  LogOut,
  RefreshCw,
  Camera,
} from "lucide-react";
import "./day.css";
import { combinedRows } from "../server/rules.js";

const icons = {
  steps: Footprints,
  loss: Scale,
  gain: Scale,
  smoke: Flame,
  water: Droplets,
};
const nav = [
  { id: "overview", name: "首页", icon: Home },
  { id: "teams", name: "组队广场", icon: Users },
  { id: "leaderboard", name: "排行榜", icon: Trophy },
  { id: "records", name: "我的", icon: Activity },
];
const fmt = (n) =>
  Number(n || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
const time = (n) =>
  n
    ? new Date(n).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const apiBase = `${import.meta.env.BASE_URL}api`;
async function api(url, body) {
  const r = await fetch(apiBase + url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "MoveTogether",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseText = await r.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error("服务暂时不可用，请稍后重试");
  }
  if (!r.ok) throw new Error(data?.error || "请求失败，请稍后重试");
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("服务返回异常，请稍后重试");
  return data;
}
function Logo() {
  return (
    <a className="logo" href="#overview">
      <span>
        <Activity size={29} />
      </span>
      <div>
        跃动<b>.</b>
        <small>MOVE TOGETHER</small>
      </div>
    </a>
  );
}
function Avatar({ name = "", color = "sage" }) {
  return <span className={"avatar " + color}>{name.slice(-2)}</span>;
}
function Button({ children, variant = "", className = "", ...props }) {
  return (
    <button className={`btn ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
function Empty({ title = "这里还在等第一位伙伴", children }) {
  return (
    <div className="empty">
      <Leaf size={29} />
      <h3>{title}</h3>
      <p>{children || "今天的小小坚持，会在这里被看见。"}</p>
    </div>
  );
}
function TrackPill({ track }) {
  const Icon = icons[track.id];
  return (
    <span className={"track-pill " + track.color}>
      <Icon size={14} />
      {track.name}
    </span>
  );
}
function Heading({ eyebrow, title, children }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <small>{eyebrow}</small>}
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}
function TrackTabs({ tracks, selected, onSelect }) {
  return (
    <div className="track-tabs" aria-label="选择赛道">
      {tracks.map((t) => {
        const Icon = icons[t.id];
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            aria-pressed={selected === t.id}
            className={selected === t.id ? "active " + t.color : ""}
          >
            <Icon size={17} />
            {t.short}
          </button>
        );
      })}
    </div>
  );
}
function RankTabs({ value, onChange }) {
  return <div className="rank-toggle" aria-label="榜单类型">
    {[["combined", "综合榜"], ["personal", "个人榜"], ["team", "团队榜"]].map(([id, name]) => (
      <button key={id} className={value === id ? "active" : ""}
        aria-pressed={value === id} onClick={() => onChange(id)}>{name}</button>
    ))}
  </div>;
}
function boardRows(board, type) {
  return type === "combined" ? (board.combined || combinedRows(board)) : board[type];
}
function rankStatus(row, isTeam) {
  if (isTeam) return `${row.count} 人报名 · ${row.checked} 人完成`;
  if (row.checked) return row.imageChecked ? "图片打卡" : "已打卡";
  return row.imageChecked ? "图片已传 · 待提交" : "待打卡";
}
function LeaderTable({ rows, track, type, me }) {
  return (
    <div className="leader-table">
      <div className="leader-head">
        <span>排名</span>
        <span>{type === "team" ? "参赛团队" : type === "combined" ? "参赛个人 / 团队" : "运动伙伴"}</span>
        <span>{type === "team" ? "人均成绩" : "成绩"}</span>
      </div>
      {!rows.length ? <Empty title="这条赛道，等你来开场" /> : rows.map((u) => {
        const isTeam = u.kind === "team" || type === "team";
        const isMe = isTeam ? u.id === me?.team_ids?.[track.id] : u.id === me?.id;
        return <div className={"leader-row " + (isMe ? "is-me" : "")} key={`${isTeam ? "team" : "personal"}:${u.id}`}>
          <span className={"position p" + u.rank}>
            {u.rank <= 3 ? <Trophy size={19} /> : String(u.rank).padStart(2, "0")}
            {u.rank <= 3 && <small>{u.rank}</small>}
          </span>
          <div className="leader-person">
            <Avatar name={u.name} color={u.color} />
            <div>
              <b>{u.name}{isMe && <em>{isTeam ? "我的队" : "我"}</em>}</b>
              <small className="rank-meta">
                {type === "combined" && <span className={"rank-kind " + (isTeam ? "team" : "")}>{isTeam ? "团队" : "个人"}</span>}
                <span className={u.checked && u.imageChecked && !isTeam ? "photo-status" : ""}>
                  {u.checked && u.imageChecked && !isTeam && <Camera size={11} />}{rankStatus(u, isTeam)}
                </span>{u.demo ? " · 体验" : ""}
              </small>
            </div>
          </div>
          <div className="leader-score"><b>{fmt(u.score)}</b><span>{track.unit}{isTeam ? "/人" : ""}</span></div>
        </div>;
      })}
    </div>
  );
}
function Onboarding({ data, onComplete }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const closed = ["paused", "final"].includes(data.activity.status);
  async function submit(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try { onComplete(await api("/register", { name: name.trim() })); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <main className="welcome">
    <section className="welcome-story">
      <img src={`${import.meta.env.BASE_URL}tracks/steps.jpg`} alt="阳光下的山间步道" />
      <div className="welcome-tint" /><Logo />
      <div className="welcome-message"><span>ONE DAY. GOOD ENERGY.</span><h1>今天的好状态，<br />从你开始。</h1><p>五种热爱，各有主场。<br />一个人自在出发，和伙伴一起也很好。</p>
      <div className="welcome-track-icons"><Footprints /><Scale /><Flame /><Droplets /></div></div>
      <small className="welcome-story-footer">会议健康运动挑战 · MOVE TOGETHER</small>
    </section>
    <section className="welcome-form-panel"><div className="welcome-form-inner">
      <span className="eyebrow">LET’S MOVE TOGETHER</span>
      <h2>嗨，怎么称呼你？</h2>
      <p className="welcome-sub">填个名字，选喜欢的项目。每个项目都可以个人参加，也可以和伙伴组队。</p>
      {closed ? <div className="form-error" role="alert">{data.activity.status === "final" ? "活动已结榜，报名已关闭。" : "活动暂停中，请等待管理员恢复。"}<a href="#screen">查看各赛道榜单 <ArrowUpRight size={16}/></a></div> :
      <form onSubmit={submit}>
        <label className="field">你的名字 <span>*</span><input aria-label="你的名字" autoComplete="nickname" required maxLength={16} placeholder="输入你的名字或昵称" value={name} onChange={(e) => setName(e.target.value)} /><small>最多 16 个字，名字会显示在队伍与排行榜中。</small></label>
        {error && <div role="alert" className="form-error">{error}</div>}
        <div className="welcome-actions"><Button className="full" type="submit" disabled={busy || !name.trim()}>{busy ? <LoaderCircle size={19} className="spin"/> : <>进入活动<ArrowRight size={18}/></>}</Button></div>
        <p className="welcome-privacy"><ShieldCheck size={14}/>无需登录 · 无需下载 · 数据自主记录</p>
      </form>}
      <div className="welcome-bottom"><span>一点行动，一整天的好能量。</span><a href="#admin">活动管理 <ArrowUpRight size={13}/></a></div>
    </div></section>
  </main>;
}

function isTeamMember(team, me) {
  return !!me && (me.team_ids?.[team.track] === team.id || team.members.some(member => member.id === me.id));
}
function projectTeam(teams, me, track) {
  return teams.find(team => team.track === track && isTeamMember(team, me));
}
function ProjectTeams({ data, track, query = "", onOpen }) {
  const project = data.tracks.find(t => t.id === track);
  const projectTeams = data.teams.filter(team => team.track === track);
  const joined = projectTeams.filter(team => isTeamMember(team, data.me));
  const discovered = projectTeams.filter(team => !isTeamMember(team, data.me) && team.name.includes(query.trim()));
  function rows(teams) {
    return <div className="team-list">{teams.map(team => {
      const own = isTeamMember(team, data.me);
      const full = team.members.length >= 5;
      const result = data.boards[track].team.find(row => row.id === team.id);
      return <article className={"team-list-row" + (own ? " joined" : "")} key={team.id}>
        <div className="team-list-identity">
          <Avatar name={team.name} color={team.color}/>
          <div className="team-list-name"><button onClick={() => onOpen(team)} title={team.name}>{team.name}</button><p title={team.slogan}>{team.slogan}</p></div>
        </div>
        <div className="team-list-members"><div className="member-stack">{team.members.slice(0, 3).map(member => <Avatar key={member.id} name={member.name} color={member.color}/>)}{team.members.length > 3 && <span className="team-list-more">+{team.members.length - 3}</span>}</div><span>{team.members.length}/5 人<span className="team-list-availability"> · {own ? "我的队伍" : full ? "已满员" : "招募中"}</span></span></div>
        <div className="team-list-score"><b>{fmt(result?.score)}</b><small>{project.unit}/人</small></div>
        <Button variant={own ? "soft" : "outline"} className="team-list-action" onClick={() => onOpen(team)} aria-label={`${team.name}，${own ? "已在队伍中，查看详情" : full || joined.length ? "查看队伍" : "查看并加入"}`}>
          {own ? <><Check size={15}/>已在队伍中</> : <>{full ? "查看满员队伍" : joined.length ? "查看队伍" : "查看并加入"}<ChevronRight size={15}/></>}
        </Button>
      </article>;
    })}</div>;
  }
  return <div className="project-team-sections">
    <section className="team-list-section" aria-label="已加入队伍">
      <div className="team-section-heading"><h3>已加入队伍</h3><span>{joined.length}</span><TrackPill track={project}/></div>
      {joined.length ? rows(joined) : <div className="team-joined-empty"><Users size={19}/><p>还未加入{project.short}队伍<span>在下方发现伙伴，或创建自己的队伍</span></p></div>}
    </section>
    <section className="team-list-section" aria-label="发现">
      <div className="team-section-heading"><h3>发现</h3><span>{discovered.length}</span><small>本项目的其他队伍</small></div>
      {discovered.length ? rows(discovered) : <div className="team-discovery-empty"><Search size={22}/><b>{query.trim() ? "没有找到这支队伍" : "暂时没有其他队伍"}</b><p>{query.trim() ? "试试其他队名，已加入队伍仍在上方。" : "你可以创建队伍，邀请伙伴一起参加。"}</p></div>}
    </section>
  </div>;
}

function App() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(location.hash.slice(1) === "challenges" ? "overview" : location.hash.slice(1) || "overview"),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState("");
  const [track, setTrack] = useState("steps"),
    [rankType, setRankType] = useState("combined"),
    [teamQuery, setTeamQuery] = useState("");
  const toastTimer = useRef();
  function notify(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }
  async function refresh() {
    try {
      setData(await api("/state"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15000);
    const onHash = () => {
      setPage(location.hash.slice(1) === "challenges" ? "overview" : location.hash.slice(1) || "overview");
      setModal(null);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      clearInterval(timer);
      window.removeEventListener("hashchange", onHash);
      clearTimeout(toastTimer.current);
    };
  }, []);
  const invitationHandled = useRef(false);
  useEffect(() => {
    if (!data?.me || invitationHandled.current || page === "admin" || page.startsWith("screen")) return;
    const id = new URLSearchParams(location.search).get("team");
    if (!id) return;
    invitationHandled.current = true;
    const team = data.teams.find(t=>t.id===id);
    if (team) { setTrack(team.track); setModal({type:"teamDetail",team,track:team.track,invited:true}); }
    else setModal({type:"invitation",legacyId:id});
  }, [data?.me?.id, page]);
  function need(type, extra = {}) {
    setModal({ type: type === "register" ? "enroll" : type, ...extra });
  }
  function recordTrack(id) {
    setTrack(id);
    setModal({ type: data.me.tracks.includes(id) ? "checkin" : "participate", track: id });
  }
  async function share(team) {
    const url = new URL(location.origin + location.pathname);
    if (team) url.searchParams.set("team", team.id);
    const title = team
      ? `加入${team.name} · ${data.tracks.find(t=>t.id===team.track)?.short}挑战`
      : "跃动 · 今天，为健康多走一步";
    try {
      if (navigator.share) {
        await navigator.share({ title, url: url.href });
        return;
      }
      await navigator.clipboard.writeText(url.href);
      notify("链接已复制，发送到会议微信群吧");
    } catch (e) {
      if (e.name !== "AbortError") setModal({ type: "share", url: url.href });
    }
  }
  if (!data)
    return (
      <div className="loading">
        <Logo />
        <LoaderCircle className="spin" />
        <p>{error || "正在准备今天的运动场…"}</p>
        {error && <Button onClick={refresh}>重试</Button>}
      </div>
    );
  if (!data.me && page !== "admin" && page.split("?")[0] !== "screen")
    return <Onboarding data={data} onComplete={(d) => {
      setData(d); setModal(null); history.replaceState(null, "", location.pathname + location.search + "#overview"); setPage("overview");
    }} />;
  const { me, tracks, activity, boards, teams } = data;
  const selectedTrack = tracks.find((t) => t.id === track) || tracks[0];
  const ownTeam = projectTeam(teams, me, track);
  const frozen = activity.status === "final",
    paused = activity.status === "paused";
  const enrolled = me?.tracks || [];
  const mine = tracks.filter((t) => enrolled.includes(t.id));
  const status = {
    upcoming: "赛前集结中",
    active: "今日挑战进行中",
    paused: "活动已停表",
    final: "最终榜已出炉",
  }[activity.status];
  const anyRecord = me?.records.length || 0;
  return (
    <>
      {page.split("?")[0] === "screen" ? (
        <Screen data={data} />
      ) : (
        <div className="app-shell">
          <aside className="sidebar">
            <Logo />
            <p className="sidebar-caption">把今天，过得更健康一点。</p>
            <span className="workspace-label">
              今日活动 <small>WORKSPACE</small>
            </span>
            <nav aria-label="桌面导航">
              {nav.map(({ id, name, icon: Icon }) => (
                <a
                  href={"#" + id}
                  className={page === id ? "active" : ""}
                  key={id}
                >
                  <Icon size={20} />
                  {name}
                </a>
              ))}
            </nav>
            <div className="sidebar-note">
              <Leaf size={26} />
              <h3>
                五种热爱
                <br />
                一种好状态。
              </h3>
              <p>
                选适合自己的挑战，
                <br />
                和伙伴一起，为健康加分。
              </p>

            </div>
            <button
              className="sidebar-help"
              onClick={() => setModal({ type: "rules" })}
            >
              <Info size={16} />
              活动规则与说明
              <ArrowUpRight size={14} />
            </button>
            <a href="#admin" className="admin-link">
              <Settings2 size={15} />
              活动管理
            </a>
            <div className="sidebar-user">
              <Avatar name={me?.name || "访客"} color={me?.color} />
              <div>
                <b>{me?.name || "你好，运动伙伴"}</b>
                <small>
                  {me
                    ? `已报名 ${enrolled.length} 个项目`
                    : "昵称报名，即刻出发"}
                </small>
              </div>
            </div>
          </aside>
          <div className="main-shell">
            <header className="topbar">
              <div>
                <span>会议健康运动挑战</span>
                <ChevronRight size={13} />
                <b>{nav.find((n) => n.id === page)?.name || "活动管理"}</b>
              </div>
              <div>
                <span className="top-date">
                  <CalendarDays size={14} />
                  {activity.date.replaceAll("-", ".")} · 单日赛
                </span>
                <button
                  className="icon-button"
                  onClick={() => setModal({ type: "rules" })}
                  aria-label="活动规则"
                >
                  <Info size={19} />
                </button>
                <Avatar name={me?.name || "跃"} color={me?.color} />
              </div>
            </header>
            <main>
              {error && (
                <div role="alert" className="connection-error">
                  {error}，正在尝试重连{" "}
                  <button onClick={refresh}>立即重试</button>
                </div>
              )}
              {page === "admin" ? (
                <Admin data={data} setData={setData} notify={notify} />
              ) : (
                <>
                  <section className="page-intro">
                    <div>
                      <span className="eyebrow">
                        <i />
                        {status}
                        <em>ONE DAY, FIVE WAYS.</em>
                      </span>
                      <h1>
                        {page === "overview" ? (
                          <>
                            今天，健康<span>各有主场。</span>
                          </>
                        ) : page === "teams" ? (
                          <>
                            找到你的<span>运动搭子。</span>
                          </>
                        ) : page === "leaderboard" ? (
                          <>
                            每一份坚持，都<span>看得见。</span>
                          </>
                        ) : (
                          <>
                            为自己，记下<span>小小成就。</span>
                          </>
                        )}
                      </h1>
                    </div>
                  </section>
                  {(paused || frozen) && (
                    <div className={"state-banner " + (frozen ? "final" : "")}>
                      <span>
                        {frozen ? <Trophy size={20} /> : <Pause size={20} />}
                      </span>
                      <div>
                        <b>
                          {frozen
                            ? "今日挑战已结榜，感谢每一份坚持"
                            : "暂时停表，休息一下再出发"}
                        </b>
                        <p>
                          {frozen
                            ? "成绩和报名已锁定，最终榜单可投屏查看。"
                            : "当前无法更新数据或报名，等待管理员恢复。"}
                        </p>
                      </div>
                      {frozen && (
                        <a href={"#screen?report=" + activity.finalId}>
                          查看最终榜
                          <ArrowUpRight size={16} />
                        </a>
                      )}
                    </div>
                  )}
                  {page === "overview" && (
                    <>
                      <section className="hero">
                        <div className="hero-copy">
                          <span className="hero-tag">
                            <i /> 会议健康运动挑战 · 只赛今天
                          </span>
                          <h2>
                            会聚热爱，
                            <br />
                            一起跃动。
                          </h2>
                          <p>
                            不必样样出众，找到适合你的那一项。
                            <br />
                            今天的好状态，从一个小行动开始。
                          </p>
                          <div className="hero-meta">
                            <span>
                              <CalendarDays size={15} />
                              {activity.date.slice(5).replace("-", ".")} ·{" "}
                              {activity.timeLimited ? `${activity.startTime}—${activity.endTime}` : "随时记录 · 手动结榜"}
                            </span>
                            <span>
                              <Users size={15} />
                              {data.stats.participants} 位伙伴已集结
                            </span>
                          </div>
                          <Button
                            variant="lime"
                            onClick={() =>
                              frozen
                                ? (location.hash = "leaderboard")
                                : document.getElementById("projects").scrollIntoView({ behavior: "smooth", block: "start" })
                            }
                          >
                            {frozen
                              ? "查看今日榜单"
                              : me
                                ? "选择我的挑战"
                                : "选项目，开始今天的挑战"}
                            <ArrowUpRight size={17} />
                          </Button>
                        </div>
                        <div className="hero-sticker">
                          <Footprints size={29} />
                          <b>
                            ONE DAY.
                            <br />
                            GOOD ENERGY.
                          </b>
                          <small>把健康留在今天</small>
                        </div>
                        <div className="hero-footer">
                          <i />
                          自愿报名 · 自主记录 · 分赛道排名
                        </div>
                        <span className="hero-index">01 / 01</span>
                      </section>
                      <Heading
                        eyebrow="FIND YOUR CHALLENGE"
                        title="你的健康，你选主场"
                      >
                        <span className="subtle">可同时报名多个项目</span>
                      </Heading>
                      <div className="track-grid" id="projects">
                        {tracks.map((t) => {
                          const Icon = icons[t.id],
                            joined = enrolled.includes(t.id),
                            row = boards[t.id].personal.find(
                              (u) => u.id === me?.id,
                            );
                          return (
                            <button key={t.id} className={"project-card project-" + t.id}
                              disabled={frozen || paused} onClick={() => recordTrack(t.id)}
                              aria-label={`${t.name}，${!joined ? "选择参赛方式" : t.id === "water" ? "拍照喝水打卡" : `${row?.checked ? "更新" : "录入"}今日数据`}`}>
                              <img src={`${import.meta.env.BASE_URL}tracks/${t.id}.jpg`} alt="" loading="lazy" />
                              <div className="project-shade" />
                              <div className="project-top"><span className="project-icon"><Icon size={21} /></span>
                                <span className="project-badge">{joined ? (projectTeam(teams, me, t.id)?.name || "个人参赛") : `${boards[t.id].personal.length} 人参加`}</span></div>
                              <div className="project-copy"><h3>{t.name}</h3><p>{t.hint}</p>
                                <div className="project-score"><small>{joined ? "我的成绩" : "今日目标"}</small>
                                  <strong>{joined ? fmt(row?.score) : fmt(t.goal)}<span>{t.unit}</span></strong></div>
                                <div className="project-meter"><i style={{width: `${Math.min(100, ((row?.score || 0) / t.goal) * 100)}%`}} /></div>
                                <div className="project-action"><span>{frozen ? "今日已结榜" : paused ? "已暂停打卡" : !joined ? "选择参赛方式" : t.id === "water" ? "拍照喝水打卡" : row?.checked ? "更新今日数据" : "录入今日数据"}</span><ArrowUpRight size={19} /></div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <div className="overview-bottom">
                        <section className="card">
                          <Heading title="今日能量榜">
                            <a className="text-link" href="#leaderboard">
                              完整榜单
                              <ChevronRight size={14} />
                            </a>
                          </Heading>
                          <TrackTabs
                            tracks={tracks}
                            selected={track}
                            onSelect={setTrack}
                          />
                          <RankTabs value={rankType} onChange={setRankType} />
                          <LeaderTable
                            rows={boardRows(boards[track], rankType).slice(0, 4)}
                            track={selectedTrack}
                            type={rankType}
                            me={me}
                          />
                        </section>
                        <section className="card team-spotlight">
                          <span className="eyebrow">BETTER TOGETHER</span>
                          <Users size={31} />
                          <h2>
                            搭个队，
                            <br />
                            让坚持更有趣。
                          </h2>
                          <p>
                            每支战队专注一个项目，最多五位伙伴。不同项目可以加入不同战队，按队内人均成绩排名。
                          </p>
                          {ownTeam ? (
                            <>
                              <div className="own-team-label">
                                <Avatar
                                  name={ownTeam.name}
                                  color={ownTeam.color}
                                />
                                <div>
                                  <b>{ownTeam.name}</b>
                                  <small>
                                    {selectedTrack.short} · {ownTeam.members.length}/5 位伙伴
                                  </small>
                                </div>
                              </div>
                              <Button
                                variant="lime"
                                onClick={() => share(ownTeam)}
                              >
                                <Share2 size={16} />
                                邀请队友
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="lime"
                              onClick={() => (location.hash = "teams")}
                            >
                              去找运动搭子
                              <ArrowUpRight size={17} />
                            </Button>
                          )}

                        </section>
                      </div>
                    </>
                  )}
                  {page === "leaderboard" && (
                    <section className="card ranking-card">
                      <Heading title={frozen ? "今日最终榜" : "今日实时榜"}>
                        <a
                          className="text-link"
                          href={
                            frozen
                              ? "#screen?report=" + activity.finalId
                              : "#screen"
                          }
                        >
                          <Monitor size={16} />
                          投屏模式
                        </a>
                      </Heading>
                      <TrackTabs
                        tracks={tracks}
                        selected={track}
                        onSelect={setTrack}
                      />
                      <div className="rank-toolbar">
                        <RankTabs value={rankType} onChange={setRankType} />
                        <small>{boardRows(boards[track], rankType).length} {rankType === "personal" ? "位伙伴" : rankType === "team" ? "支团队" : "个参赛席位"}</small>
                      </div>
                      <LeaderTable
                        rows={boardRows(boards[track], rankType)}
                        track={selectedTrack}
                        type={rankType}
                        me={me}
                      />
                      {data.demo && (
                        <p className="footnote">
                          标有「体验」的数据仅供演示，正式活动可关闭。
                        </p>
                      )}
                    </section>
                  )}
                  {page === "teams" && (
                    <section className="project-team-plaza">
                      <TrackTabs tracks={tracks} selected={track} onSelect={id=>{setTrack(id);setTeamQuery("");}}/>
                      <div className="project-team-header"><div><span className="eyebrow">BETTER TOGETHER</span><h2>{selectedTrack.short}战队 <small>{teams.filter(t=>t.track===track).length} 支</small></h2></div>
                        <Button disabled={!!ownTeam || frozen || paused} onClick={()=>need("createTeam",{track})}><Plus size={17}/>{ownTeam ? "本项目已入队" : "创建战队"}</Button></div>
                      <div className="team-toolbar"><span className="subtle">一队一个项目 · 最多 5 人</span><label className="search-box"><Search size={16}/><input aria-label="搜索队伍" placeholder="搜索发现中的队伍" value={teamQuery} onChange={e=>setTeamQuery(e.target.value)}/></label></div>
                      <ProjectTeams data={data} track={track} query={teamQuery} onOpen={team=>setModal({type:"teamDetail",team,track})}/>
                    </section>
                  )}
                  {page === "records" && (
                    <>
                      {!me ? (
                        <section className="card guest-card">
                          <Leaf size={35} />
                          <h2>今天的好状态，从你开始。</h2>
                          <p>
                            填一个昵称，选上喜欢的项目，就能记录今天的小成就。
                          </p>
                          <Button
                            disabled={frozen || paused}
                            onClick={() => need("register")}
                          >
                            选择项目，昵称报名
                            <ArrowUpRight size={17} />
                          </Button>
                        </section>
                      ) : (
                        <>
                          <div className="profile-card">
                            <Avatar name={me.name} color={me.color} />
                            <div>
                              <small>你好，运动伙伴</small>
                              <h2>{me.name}</h2>
                              <p>{Object.keys(me.team_ids || {}).length ? `已加入 ${Object.keys(me.team_ids).length} 支项目战队` : "按项目自由选择个人或组队"}</p>
                            </div>
                            <div className="profile-stat">
                              <b>
                                {enrolled.length}
                                <small>项</small>
                              </b>
                              <span>已报名</span>
                            </div>
                            <div className="profile-stat">
                              <b>
                                {anyRecord}
                                <small>项</small>
                              </b>
                              <span>已记录</span>
                            </div>
                          </div>
                          <Heading title="我的今日项目">
                            <Button
                              variant="outline"
                              disabled={frozen || paused}
                              onClick={() => setModal({ type: "enroll" })}
                            >
                              <Plus size={16} />
                              增加项目
                            </Button>
                          </Heading>
                          <div className="my-track-grid">
                            {mine.map((t) => {
                              const row = boards[t.id].personal.find(
                                  (r) => r.id === me.id,
                                ),
                                r = me.records.find((r) => r.track === t.id),
                                Icon = icons[t.id];
                              return (
                                <section
                                  className={"card my-track " + t.color}
                                  key={t.id}
                                >
                                  <div className="my-track-title">
                                    <span className="track-icon">
                                      <Icon size={24} />
                                    </span>
                                    <div>
                                      <h3>{t.name}</h3>
                                      <small>
                                        预设目标 {t.goal} {t.unit}
                                      </small>
                                    </div>
                                    <span className="pill">
                                      {row?.checked
                                        ? "已打卡"
                                        : r
                                          ? "待晚称"
                                          : "待打卡"}
                                    </span>
                                  </div>
                                  <div className="my-project-team"><Users size={15}/><span>{projectTeam(teams, me, t.id)?.name || "个人参赛"}</span>
                                    <button onClick={()=>{const team=projectTeam(teams, me, t.id);setModal(team ? {type:"teamDetail",track:t.id,team} : {type:"joinTeam",track:t.id});}} disabled={!projectTeam(teams, me, t.id) && (frozen || paused)}>{projectTeam(teams, me, t.id) ? "查看战队" : "去组队"}<ChevronRight size={14}/></button></div>
                                  <div className="my-track-value">
                                    <b>{fmt(row?.score)}</b>
                                    <span>{t.unit}</span>
                                    <small>当前第 {row?.rank} 名</small>
                                  </div>
                                  <div className="track-progress">
                                    <span
                                      style={{
                                        width:
                                          Math.min(
                                            100,
                                            ((row?.score || 0) / t.goal) * 100,
                                          ) + "%",
                                      }}
                                    />
                                  </div>
                                  {t.weight && r && (
                                    <div className="weight-values">
                                      <span>
                                        早称 <b>{r.morning} 斤</b>
                                      </span>
                                      <span>
                                        晚称{" "}
                                        <b>
                                          {r.evening == null
                                            ? "待填写"
                                            : r.evening + " 斤"}
                                        </b>
                                      </span>
                                    </div>
                                  )}
                                  <p>
                                    {r ? `最后更新 ${time(r.updated)}` : t.rule}
                                  </p>
                                  <Button
                                    variant="soft"
                                    disabled={frozen || paused}
                                    onClick={() =>
                                      setModal({ type: "checkin", track: t.id })
                                    }
                                  >
                                    {frozen
                                      ? "今日成绩已锁定"
                                      : t.id === "water" ? "拍照喝水打卡" : r
                                        ? "更新累计数据"
                                        : "填写今日数据"}
                                    <ArrowUpRight size={16} />
                                  </Button>
                                </section>
                              );
                            })}
                          </div>
                          <p className="footnote">
                            <ShieldCheck size={14} />
                            自己记录，自己监督。喝水拍照逐次累计，其他项目更新当天数据。
                          </p>
                        </>
                      )}
                    </>
                  )}
                  {page === "records" && <EvidenceGallery items={me?.evidence || []} tracks={tracks} title="我的打卡凭证"/>}
                  <div className="wellness-strip">
                    <span>
                      <Leaf size={22} />
                    </span>
                    <div>
                      <b>健康没有统一答案，适合自己就很好。</b>
                      <p>
                        体重的单日变化不代表脂肪变化；不为排名节食、脱水或过量饮水。
                      </p>
                    </div>

                  </div>
                </>
              )}
            </main>
            <footer>
              <Logo />
              <span>一起运动，一起把今天过得更好。</span>
              <div>
                {data.demo && <small>含演示数据</small>}
                <button onClick={() => setModal({ type: "rules" })}>
                  活动规则
                </button>
                <a href="#admin">管理入口</a>
              </div>
            </footer>
          </div>
          <nav className="mobile-nav" aria-label="手机导航">
            {nav.map(({ id, name, icon: Icon }) => (
              <a
                key={id}
                href={"#" + id}
                className={page === id ? "active" : ""}
              >
                <span>
                  <Icon size={22} />
                </span>
                <small>{name}</small>
              </a>
            ))}
          </nav>
        </div>
      )}
      {modal && (
        <Modal
          key={modal.type + (modal.track || "") + (modal.team?.id || "")}
          modal={modal}
          data={data}
          setData={setData}
          close={() => setModal(null)}
          notify={notify}
          share={share}
          setModal={setModal}
        />
      )}{" "}
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
    </>
  );
}
async function imageData(file, watermark) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type))
    throw new Error("请选择 JPG、PNG 或 WebP 图片");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("图片过大，请选择小于 20 MB 的原图");
  // Older iOS / WeChat versions may not implement createImageBitmap.
  let bitmap;
  if (typeof createImageBitmap === "function") {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      // Fall through to the browser's image decoder.
    }
  }
  if (!bitmap) {
    const url = URL.createObjectURL(file);
    try {
      bitmap = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("图片无法读取，请换一张截图或手动填写"));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  const photoHeight = Math.round(bitmap.height * scale);
  const footer = watermark ? Math.round(canvas.width * 0.22) : 0;
  canvas.height = photoHeight + footer;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, photoHeight);
  bitmap.close?.();
  if (watermark) {
    const w = canvas.width, padding = w * 0.045;
    context.fillStyle = "#173e31";
    context.fillRect(0, photoHeight, w, footer);
    context.fillStyle = "#d9edb0";
    context.font = `600 ${w * 0.038}px sans-serif`;
    context.fillText("跃动 · 喝水打卡", padding, photoHeight + footer * 0.28);
    context.fillStyle = "#fff";
    context.font = `500 ${w * 0.033}px sans-serif`;
    context.fillText(`${watermark.name} · 本次 1 杯`, padding, photoHeight + footer * 0.57, w - padding * 2);
    context.fillStyle = "#c1d2c5";
    context.font = `${w * 0.026}px sans-serif`;
    const stamp = new Date(watermark.capturedAt).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai", hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    context.fillText(`${stamp} · 自己记录，自己监督`, padding, photoHeight + footer * 0.83, w - padding * 2);
  }
  return canvas.toDataURL("image/jpeg", 0.88);
}
function EvidenceGallery({ items = [], tracks = [], title = "已保存的打卡凭证" }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  return <details className="evidence-gallery">
    <summary><Camera size={16}/><span>{title}</span><b>{items.length} 张</b><ChevronRight size={16}/></summary>
    <p>仅本人和管理员可查看，点击图片放大，或下载留存。</p>
    <div className="evidence-grid">{(all ? items : items.slice(0, 8)).map(item => {
      const label = `${tracks.find(t => t.id === item.track)?.short || "打卡"}${item.slot === "morning" ? " · 早称" : item.slot === "evening" ? " · 晚称" : ""}`;
      return <article key={item.id}>
        <a href={`${apiBase}/evidence/${item.id}`} target="_blank" rel="noreferrer" aria-label={`查看${label}凭证`}><img src={`${apiBase}/evidence/${item.id}`} alt={`${label}凭证`} loading="lazy"/></a>
        <div><b>{label}</b><small>{time(item.captured_at || item.created)}</small><a href={`${apiBase}/evidence/${item.id}?download=1`} download><Download size={13}/>保存图片</a></div>
      </article>;
    })}</div>
    {!all && items.length > 8 && <button className="text-link" type="button" onClick={() => setAll(true)}>查看全部 {items.length} 张凭证</button>}
  </details>;
}
function WaterCheckin({ me, activity, track, onBusy, onComplete }) {
  const [photo, setPhoto] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const file = useRef(), clock = useRef({ server: activity.serverNow, client: Date.now() });
  const total = me.records.find(r => r.track === "water")?.value || 0;
  async function capture(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setBusy(true); onBusy(true); setError(""); setPhoto(null);
    try {
      const capturedAt = clock.current.server + Date.now() - clock.current.client;
      const image = await imageData(selected, { name: me.name, capturedAt });
      setPhoto({ image, capturedAt, clientId: crypto.randomUUID() });
    } catch (error) { setError(error.message); }
    finally { setBusy(false); onBusy(false); event.target.value = ""; }
  }
  async function submit(event) {
    event.preventDefault();
    if (!photo || busy) return;
    setBusy(true); onBusy(true); setError("");
    try { onComplete(await api("/water/checkins", photo)); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); onBusy(false); }
  }
  return <form className="checkin-form water-checkin" onSubmit={submit}>
    <div className="checkin-goal"><TrackPill track={track}/><span>今日目标 <b>{track.goal} 杯</b></span></div>
    <div className="water-tally"><div><span>今天已喝</span><strong>{fmt(total)}<small>杯</small></strong></div><div><Camera size={21}/><b>拍一张，记一杯</b><small>照片自动添加昵称和时间水印</small></div></div>
    <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="拍摄喝水照片" onChange={capture} disabled={busy} hidden/>
    {photo ? <div className="water-photo"><img src={photo.image} alt="待提交的喝水水印照片"/><div><span><ShieldCheck size={15}/>水印已添加 · 确认后保存</span><button className="text-link" disabled={busy} type="button" onClick={() => file.current.click()}>重新拍摄</button></div></div>
      : <button className="water-camera" type="button" disabled={busy || total >= track.max} onClick={() => file.current.click()}><span><Camera size={34}/></span><b>{busy ? "正在添加水印…" : "拍摄我的这杯水"}</b><small>拍下水杯，留下今天的健康瞬间</small><em>打开相机 <ArrowUpRight size={16}/></em></button>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <p className="field-note"><Info size={15}/>每次确认打卡累计 1 杯，约 250 mL。按需适量饮水。</p>
    <EvidenceGallery items={(me.evidence || []).filter(e => e.track === "water")} tracks={[track]} title="我的水印照片"/>
    <div className="checkin-submit"><Button className="full" type="submit" disabled={!photo || busy || total >= track.max}>{busy ? <LoaderCircle className="spin" size={18}/> : <><Check size={19}/>{photo ? "确认照片，打卡 +1 杯" : total >= track.max ? "今日杯数已达上限" : "拍照后完成打卡"}</>}</Button><p className="privacy">照片将保存为核对凭证，仅本人和管理员可查看。</p></div>
  </form>;
}
function ScreenshotInput({ track, disabled, onBusy, onResult, onSaved }) {
  const [slot, setSlot] = useState("morning"),
    [reading, setReading] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const file = useRef();
  async function recognize(e) {
    const image = e.target.files?.[0];
    if (!image) return;
    const chosenSlot = slot;
    setReading(true);
    onBusy(true);
    setMessage("");
    setError("");
    let saved = false;
    try {
      const upload = await api("/evidence", { track: track.id, slot: chosenSlot, image: await imageData(image) });
      saved = true;
      onSaved(upload.evidence);
      const r = await api("/recognize", {
        track: track.id,
        slot: chosenSlot,
        evidenceId: upload.evidence.id,
      });
      onResult(r);
      setMessage(
        `已识别${track.weight ? (chosenSlot === "morning" ? "早称" : "晚称") : ""} ${fmt(r.value)} ${r.unit}，请核对下方数据后提交。`,
      );
    } catch (e) {
      setError(`${saved ? "图片已保存。" : "图片未保存。"}${e.message}，可在下方手动填写。`);
    } finally {
      setReading(false);
      onBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  return (
    <section className="ocr-upload">
      <div className="ocr-upload-top">
        <Camera size={25} />
        <div>
          <b>上传凭证，自动填数</b>
          <small>{track.weight ? "上传体重秤或健康 App 截图" : "微信运动 / 手机健康截图"}，也可直接手填</small>
        </div>
      </div>
      {track.weight && (
        <div className="ocr-slot">
          <label>
            <input
              type="radio"
              checked={slot === "morning"}
              disabled={disabled}
              onChange={() => setSlot("morning")}
            />
            识别早称
          </label>
          <label>
            <input
              type="radio"
              checked={slot === "evening"}
              disabled={disabled}
              onChange={() => setSlot("evening")}
            />
            识别晚称
          </label>
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={recognize}
        aria-label="上传健康截图"
        disabled={disabled}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => file.current.click()}
      >
        {reading ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <Camera size={16} />
        )}{" "}
        {reading ? "正在识别截图…" : "选择截图并识别"}
      </Button>
      {message && (
        <p className="ocr-result" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="ocr-result" role="alert">
          {error}
        </p>
      )}
      <p className="ocr-privacy">
        图片将保存为核对凭证，仅本人和管理员可查看；同时交由 DeepSeek 识别，请核对后提交。{track.weight ? "体重 kg 自动换算为斤。" : ""}
      </p>
    </section>
  );
}

function Modal({
  modal,
  data,
  setData,
  close,
  notify,
  share,
  setModal,
}) {
  const { me, tracks, activity, boards, teams } = data;
  const t = tracks.find((t) => t.id === (modal.team?.track || modal.track)) || tracks[0],
    record = me?.records.find((r) => r.track === t.id);
  const [name, setName] = useState(""),
    [slogan, setSlogan] = useState("");
  const [value, setValue] = useState(record?.value ?? ""),
    [morning, setMorning] = useState(record?.morning ?? ""),
    [evening, setEvening] = useState(record?.evening ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef(),
    busyRef = useRef(false);
  busyRef.current = busy;
  useEffect(() => {
    const prev = document.activeElement,
      old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const key = (e) => {
      if (e.key === "Escape" && !busyRef.current) close();
      if (e.key === "Tab") {
        const els = [
          ...dialog.current.querySelectorAll(
            "button:not(:disabled),input:not(:disabled),select,a[href]",
          ),
        ].filter((e) => e.offsetParent !== null);
        if (!els.length) {
          e.preventDefault();
          return;
        }
        const first = els[0],
          last = els.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === dialog.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      prev?.focus();
    };
  }, []);
  async function submit(e, url, body, msg) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = await api(url, body);
      setData(next);
      if (url === "/enrollments") setModal({type:"checkin",track:t.id});
      else if (url === "/teams" || url.endsWith("/join")) {
        const team = next.teams.find(team=>team.id===next.me.team_ids[t.id]);
        setModal({type:"teamDetail",team,track:t.id});
      } else close();
      notify(msg);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const ownTeam = projectTeam(teams, me, t.id);
  const locked = ["paused", "final"].includes(activity.status);
  const titles = {
    enroll: "选你的健康主场",
    participate: `一起参加${t.short}挑战`,
    joinTeam: `${t.short} · 找到你的战队`,
    invitation: "战队邀请",
    checkin: `记录今天的${t.short}`,
    createTeam: "集结你的运动小队",
    teamDetail: "认识你的运动搭子",
    share: "邀请伙伴，一起跃动",
    rules: "今天怎么玩，一次看明白",
  };
  const currentTeam = teams.find((t) => t.id === modal.team?.id);
  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && !busy && close()}
    >
      <section
        className={`modal${modal.type === "checkin" ? " checkin-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={dialog}
        tabIndex={-1}
      >
        <button
          className="modal-close"
          aria-label="关闭弹窗"
          disabled={busy}
          onClick={close}
        >
          <X size={22} />
        </button>
        <span className="eyebrow">
          MOVE TOGETHER
        </span>
        <h2 id="modal-title">{titles[modal.type]}</h2>
        <p className="modal-sub">
          {modal.type === "checkin"
              ? `${activity.date} · 自己记录，自己监督`
              : "每个人都有适合自己的节奏。"}
        </p>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {modal.type === "enroll" && <div className="project-options">{tracks.map(tr=>{const Icon=icons[tr.id];return <button className="participation-option" key={tr.id} disabled={locked} onClick={()=>setModal({type:me.tracks.includes(tr.id) ? "checkin" : "participate",track:tr.id})}><span className={"track-icon " + tr.color}><Icon size={23}/></span><div><b>{tr.name}</b><small>{me.tracks.includes(tr.id) ? "已报名 · 直接打卡" : `目标 ${tr.goal} ${tr.unit}`}</small></div><ChevronRight size={18}/></button>;})}</div>}
        {modal.type === "participate" && <>
          <div className="checkin-goal"><TrackPill track={t}/><span>今日目标 <b>{t.goal} {t.unit}</b></span></div>
          <div className="project-options">
            <button className="participation-option" disabled={busy || locked} onClick={e=>submit(e,"/enrollments",{tracks:[t.id]},"报名成功，可以开始打卡了")}><Activity size={25}/><div><b>{busy ? "正在报名…" : "个人参赛"}</b><small>直接开始打卡，稍后也能加入本项目战队</small></div><ChevronRight size={18}/></button>
            <button className="participation-option" disabled={busy || locked} onClick={()=>setModal({type:"joinTeam",track:t.id})}><Users size={25}/><div><b>加入战队</b><small>找一支{t.short}战队，和伙伴一起挑战</small></div><ChevronRight size={18}/></button>
            <button className="participation-option" disabled={busy || locked} onClick={()=>setModal({type:"createTeam",track:t.id})}><Plus size={25}/><div><b>创建战队</b><small>成为队长，邀请最多 4 位伙伴</small></div><ChevronRight size={18}/></button>
          </div>
        </>}
        {modal.type === "joinTeam" && <>
          <div className="project-picker-heading"><TrackPill track={t}/><Button variant="soft" disabled={locked || !!ownTeam} onClick={()=>setModal({type:"createTeam",track:t.id})}><Plus size={16}/>创建战队</Button></div>
          <ProjectTeams data={data} track={t.id} onOpen={team=>setModal({type:"teamDetail",team,track:t.id})}/>
          {!ownTeam && <Button className="full project-later" variant="outline" disabled={busy || locked} onClick={e=>me.tracks.includes(t.id) ? setModal({type:"checkin",track:t.id}) : submit(e,"/enrollments",{tracks:[t.id]},"已报名，可以开始打卡")}>先个人参赛，稍后组队<ArrowRight size={16}/></Button>}
        </>}
        {modal.type === "invitation" && <>
          {teams.some(team=>team.legacy_id===modal.legacyId) ? <><p className="field-note">原战队已按项目拆分，请选择你想加入的项目战队。</p><div className="project-options">{teams.filter(team=>team.legacy_id===modal.legacyId).map(team=><button key={team.id} className="participation-option" onClick={()=>setModal({type:"teamDetail",team,track:team.track})}><TrackPill track={tracks.find(tr=>tr.id===team.track)}/><div><b>{team.name}</b><small>{team.members.length}/5 位伙伴</small></div><ChevronRight size={16}/></button>)}</div></> : <><Empty title="这份战队邀请暂不可用">队伍可能已失效，你仍可选择喜欢的项目参赛。</Empty><Button className="full" onClick={()=>setModal({type:"enroll"})}>选择项目<ArrowRight size={16}/></Button></>}
        </>}
        {modal.type === "checkin" && t.id === "water" && <WaterCheckin me={me} activity={activity} track={t} onBusy={setBusy} onComplete={next => {setData(next);close();notify("喝水打卡成功，本次 +1 杯，水印照片已保存");}}/>}
        {modal.type === "checkin" && t.id !== "water" && (
          <form
            className="checkin-form"
            onSubmit={(e) =>
              submit(
                e,
                "/records",
                t.weight
                  ? {
                      track: t.id,
                      morning: Number(morning),
                      evening: evening === "" ? null : Number(evening),
                    }
                  : { track: t.id, value: Number(value) },
                t.weight && evening === ""
                  ? "早称已保存，晚些时候补上晚称即可"
                  : "今日记录已更新！",
              )
            }
          >
            <div className="checkin-goal">
              <TrackPill track={t} />
              <span>
                预设目标{" "}
                <b>
                  {t.goal} {t.unit}
                </b>
              </span>
            </div>
            {t.id !== "smoke" && <ScreenshotInput
              track={t}
              disabled={busy}
              onBusy={setBusy}
              onSaved={item => setData(previous => ({...previous,me:{...previous.me,evidence:[item,...(previous.me.evidence || [])]}}))}
              onResult={(r) => {
                if (t.weight) {
                  r.slot === "morning"
                    ? setMorning(r.value)
                    : setEvening(r.value);
                } else setValue(r.value);
              }}
            />}
            {t.weight ? (
              <>
                <div className="fields-two">
                  <label className="field">
                    <div className="weigh-label"><span>早称体重 <em>*</em></span><small>必填</small></div>
                    <div className="input-unit">
                      <input
                        required
                        type="number"
                        inputMode="decimal"
                        min="20"
                        max="600"
                        step="0.1"
                        placeholder="如 120.0"
                        value={morning}
                        onChange={(e) => setMorning(e.target.value)}
                      />
                      <span>斤</span>
                    </div>
                  </label>
                  <label className="field">
                    <div className="weigh-label"><span>晚称体重</span><small>可稍后填</small></div>
                    <div className="input-unit">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="20"
                        max="600"
                        step="0.1"
                        placeholder="可稍后填写"
                        value={evening}
                        onChange={(e) => setEvening(e.target.value)}
                      />
                      <span>斤</span>
                    </div>
                  </label>
                </div>
                <div className="weight-preview">
                  <span>早晚变化绝对值</span>
                  <b>
                    {morning !== "" && evening !== ""
                      ? fmt(Math.abs(Number(morning) - Number(evening)))
                      : "—"}
                    <small>斤</small>
                  </b>
                </div>
                <p className="field-note">
                  两次体重都填完后计算成绩，未完成记 0。请使用同一台秤，1 公斤 = 2 斤。
                </p>
              </>
            ) : (
              <label className="field">
                今天累计
                {t.id === "smoke"
                  ? "未吸烟时长"
                  : t.id === "water"
                    ? "喝水杯数"
                    : "步数"}{" "}
                <span>*</span>
                <div className="input-unit big">
                  <input
                    required
                    type="number"
                    inputMode={t.id === "smoke" ? "decimal" : "numeric"}
                    min="0"
                    max={t.max}
                    step={t.id === "smoke" ? 0.1 : 1}
                    placeholder={
                      t.id === "steps"
                        ? "例如 8000"
                        : t.id === "water"
                          ? "例如 6"
                          : "例如 8"
                    }
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                  <span>{t.unit}</span>
                </div>
              </label>
            )}
            <div className="info-box">
              <Info size={17} />
              <span>
                {t.rule}
                <br />
                同一天可随时更新，保留最新累计值，不重复相加。
                {t.id === "water" ? "不为排名过量饮水。" : ""}
              </span>
            </div>
            <EvidenceGallery items={(me?.evidence || []).filter(item => item.track === t.id)} tracks={tracks}/>
            <div className="checkin-submit"><Button
              className="full"
              disabled={
                busy ||
                (!t.weight && value === "") ||
                (t.weight && morning === "")
              }
              type="submit"
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <>
                  <Check size={18} />
                  {t.weight && evening === ""
                    ? "先保存早称体重"
                    : "确认数据，完成打卡"}
                </>
              )}
            </Button>
            <p className="privacy">
              {activity.timeLimited ? `${activity.endTime} 截止或提前结榜后，数据将锁定。` : "今日可随时记录，结榜后数据锁定。"}
            </p></div>
          </form>
        )}
        {modal.type === "createTeam" && (
          <form
            onSubmit={(e) =>
              submit(
                e,
                "/teams",
                { name, slogan, track: t.id },
                "小队创建成功，邀请伙伴加入吧！",
              )
            }
          >
            <div className="checkin-goal"><TrackPill track={t}/><span>固定项目 · 最多 5 人</span></div>
            <label className="field">
              小队名字 <span>*</span>
              <input
                required
                minLength={2}
                maxLength={12}
                placeholder="例如：元气满满队"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              我们的宣言 <small>选填</small>
              <input
                maxLength={30}
                placeholder="一起喊出今天的好状态"
                value={slogan}
                onChange={(e) => setSlogan(e.target.value)}
              />
            </label>
            <div className="info-box">
              <Users size={18} />
              <span>
                创建后自动报名{t.name}。已填成绩直接计入，未打卡成员计 0；按全队人均排名。其他项目可以另选战队。
              </span>
            </div>
            <Button className="full" disabled={busy || locked || !!ownTeam} type="submit">
              {busy ? "正在创建…" : "创建并加入战队"}
              <ArrowUpRight size={17} />
            </Button>
          </form>
        )}
        {modal.type === "teamDetail" && currentTeam && (()=>{
          const result=boards[t.id].team.find(b=>b.id===currentTeam.id), isOwn=ownTeam?.id===currentTeam.id, full=currentTeam.members.length>=5;
          return <>
            <div className="team-detail"><TrackPill track={t}/><h3>{currentTeam.name}</h3><p>{currentTeam.slogan}</p></div>
            <div className="project-team-summary"><div><small>全队人均 · {t.unit}</small><b>{fmt(result?.score)}</b></div><div><small>本项目团队排名</small><b>{result?.rank ? `第 ${result.rank} 名` : "—"}</b></div></div>
            <h3 className="small-heading">小队成员 <small>{currentTeam.members.length}/5 · {result?.checked || 0} 人完成</small></h3>
            {currentTeam.members.map(m=>{const score=result?.members.find(row=>row.id===m.id);return <div className="member-row project-member" key={m.id}><Avatar name={m.name} color={m.color}/><div><b>{m.name}{currentTeam.captain_id===m.id && <em>队长</em>}</b><small>{rankStatus(score || {},false)}</small></div><strong>{fmt(score?.score)}<small>{t.unit}</small></strong></div>;})}
            {isOwn ? <div className="project-detail-actions"><Button className="full" disabled={locked || busy} onClick={()=>setModal({type:"checkin",track:t.id})}>去打卡<ArrowRight size={17}/></Button><Button className="full" variant="outline" onClick={()=>share(currentTeam)}><Share2 size={16}/>邀请伙伴</Button></div> : <>
              <p className="info-box">{ownTeam ? `你已加入本项目的「${ownTeam.name}」，其他项目仍可自由组队。` : full ? "这支战队已满员，可以看看本项目其他战队，或先个人参赛。" : `加入即报名${t.name}，你今天已有的成绩会直接计入战队人均。`}</p>
              <Button className="full" disabled={busy || locked || !!ownTeam || full} onClick={e=>submit(e,`/teams/${currentTeam.id}/join`,{track:t.id},"加入成功，已有成绩已计入战队")}>{busy ? "正在加入…" : ownTeam ? "本项目已加入其他战队" : full ? "战队已满员" : `确认加入 · ${t.short}`}<ArrowRight size={16}/></Button>
              {!ownTeam && <Button className="full project-later" variant="outline" onClick={()=>setModal({type:"joinTeam",track:t.id})}>看看本项目其他战队<ChevronRight size={16}/></Button>}
              {!ownTeam && <button className="text-link project-personal-link" disabled={busy || locked} onClick={e=>me.tracks.includes(t.id) ? setModal({type:"checkin",track:t.id}) : submit(e,"/enrollments",{tracks:[t.id]},"已报名，可以开始打卡")}>先个人参赛，稍后组队</button>}
            </>}
          </>;
        })()}
        {modal.type === "share" && (
          <>
            <p className="field-note">
              复制链接发送到会议微信群，微信中点开即可昵称报名。
            </p>
            <input
              className="share-input"
              aria-label="分享链接"
              value={modal.url}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <Button className="full" onClick={close}>
              完成
              <Check size={17} />
            </Button>
          </>
        )}
        {modal.type === "rules" && (
          <div className="rules">
            <div>
              <span>01</span>
              <section>
                <h3>只赛今天，自选项目</h3>
                <p>
                  {activity.timeLimited ? `${activity.date} ${activity.startTime}–${activity.endTime}，北京时间。` : "验证期间随时可报名和打卡，不自动结榜。"}昵称报名，可选多个赛道，分别排名，不跨项目混比。管理员可提前停表或最终结榜。
                </p>
              </section>
            </div>
            <div>
              <span>02</span>
              <section>
                <h3>自己的数据，自己监督</h3>
                <p>
                  步数、戒烟小时填写当天累计值，重复更新覆盖。喝水用水印相机拍照，确认一次计 1 杯，自动累计。减重和增重均按早晚体重差的绝对值计算，不论升降；分别排名。早称可先保存，晚称后才完成记录。
                </p>
                {tracks.map((t) => (
                  <p key={t.id}>
                    <b>{t.name}：</b>预设目标 {t.goal} {t.unit}。{t.rule}
                  </p>
                ))}
              </section>
            </div>
            <div>
              <span>03</span>
              <section>
                <h3>个人比成绩，团队比人均</h3>
                <p>
                  一支战队只参加一个项目，每队最多 5 人。同一项目每人只能加入一队，不同项目可以加入不同战队。加入自动报名，已有当天成绩计入。人均＝全队成员成绩之和÷成员人数，未完成打卡计
                  0。同成绩并列。
                </p>
              </section>
            </div>
            <div>
              <span>04</span>
              <section>
                <h3>白天记录，晚饭揭榜</h3>
                <p>
                  榜单每 15
                  秒刷新。管理员可随时生成冻结的阶段战报；最终结榜后不可修改，晚饭可投屏查看。请在同一个浏览器使用，清除站点数据会丢失本机身份。
                </p>
              </section>
            </div>
            <div className="info-box">
              <Leaf size={18} />
              <span>
                目标是参考，健康更重要。一天的体重变化不等于脂肪变化，不为排名节食、脱水或过量饮水。
              </span>
            </div>
            <Button className="full" onClick={close}>
              了解了，按自己的节奏来
              <Check size={17} />
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function Admin({ data, setData, notify }) {
  const [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [participants, setParticipants] = useState([]),
    [title, setTitle] = useState("午间阶段战报"),
    [pause, setPause] = useState(false),
    [finalConfirm, setFinalConfirm] = useState(false);
  async function load() {
    try {
      const r = await api("/admin/data");
      setParticipants(r.participants);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (data.admin) load();
  }, [
    data.admin,
    data.stats.checkins,
    data.stats.participants,
    data.teams.length,
    data.activity.serverNow,
  ]);
  async function action(e, url, body, message) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api(url, body);
      setData(r);
      setFinalConfirm(false);
      notify(message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!data.admin)
    return (
      <div className="admin-login card">
        <span className="admin-lock">
          <Lock size={29} />
        </span>
        <span className="eyebrow">ACTIVITY CONTROL ROOM</span>
        <h1>
          把今天的好状态，
          <br />
          汇成一份战报。
        </h1>
        <p>这是管理员入口。参与者只需要昵称报名，无需登录。</p>
        <form
          onSubmit={(e) => action(e, "/admin/login", { key }, "已进入活动管理")}
        >
          <label className="field">
            管理口令
            <input
              required
              type="password"
              autoComplete="current-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="输入活动管理口令"
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <Button className="full" disabled={busy} type="submit">
            进入管理页
            <ArrowUpRight size={17} />
          </Button>
        </form>
        <small>未配置时，口令保存在服务端数据目录的 admin-key.txt。</small>
      </div>
    );
  const final = data.activity.status === "final",
    paused = data.activity.status === "paused";
  return (
    <>
      <section className="admin-intro">
        <span className="eyebrow">ACTIVITY CONTROL ROOM</span>
        <h1>今天的运动，由你掌舵。</h1>
        <p>
          {data.activity.timeLimited ? `${data.activity.date} · ${data.activity.startTime}–${data.activity.endTime} · 北京时间` : "验证模式 · 随时记录，手动结榜"}
        </p>
        <button
          className="text-link"
          onClick={async () => {
            await api("/admin/logout", {});
            setData(await api("/state"));
          }}
        >
          <LogOut size={15} />
          退出管理
        </button>
      </section>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="admin-stats">
        {[
          ["报名伙伴", data.stats.participants, "人"],
          ["自由小队", data.stats.teams, "队"],
          ["已填项目", data.stats.checkins, "条"],
          [
            "活动状态",
            final
              ? "已结榜"
              : paused
                ? "已停表"
                : data.activity.status === "upcoming"
                  ? "未开赛"
                  : "进行中",
            "",
          ],
        ].map(([l, v, u]) => (
          <div className="card" key={l}>
            <span>{l}</span>
            <b>
              {v}
              <small>{u}</small>
            </b>
          </div>
        ))}
      </div>
      <div className="admin-layout">
        <section className="card">
          <Heading title="阶段战报">
            <ClipboardList size={21} />
          </Heading>
          <p className="admin-description">
            中午或下午随时截取当前榜单。战报保存后固定，不受后续打卡影响。
          </p>
          <form
            onSubmit={(e) =>
              action(
                e,
                "/admin/reports",
                { title, pause },
                "阶段战报已保存，可下载或投屏",
              )
            }
          >
            <label className="field">
              战报名称
              <input
                required
                maxLength={30}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={pause}
                onChange={(e) => setPause(e.target.checked)}
              />
              生成时同时停表，暂停打卡与报名
            </label>
            <Button className="full" type="submit" disabled={busy || final}>
              <ClipboardList size={17} />
              生成阶段战报
            </Button>
          </form>
          <a className="download-live" href={apiBase + "/admin/export"}>
            <Download size={16} />
            下载当前实时战报 CSV
          </a>
        </section>
        <section className="card admin-controls">
          <Heading title="赛程控制">
            <Settings2 size={21} />
          </Heading>
          <p className="admin-description">
            {data.activity.timeLimited ? `默认 ${data.activity.endTime} 自动结榜，也可提前结榜。` : "时间限制已关闭，报名与打卡随时开放，请手动结榜。"}最终结果锁定，所有赛道停止更新。
          </p>
          <div className="control-status">
            <span className={final ? "locked" : ""}>
              {final ? (
                <Lock size={20} />
              ) : paused ? (
                <Pause size={20} />
              ) : (
                <Play size={20} />
              )}
            </span>
            <div>
              <b>
                {final
                  ? "最终榜已锁定"
                  : paused
                    ? "活动暂时停表"
                    : data.activity.timeLimited ? "报名与打卡按赛程开放" : "随时开放 · 无时间限制"}
              </b>
              <small>
                {final
                  ? "最终结果已持久化保存"
                  : paused
                    ? "恢复后，参与者可继续填数据"
                    : "阶段战报不会自动停止活动"}
              </small>
            </div>
          </div>
          <div className="control-buttons">
            <Button
              variant="outline"
              disabled={busy || final}
              onClick={(e) =>
                action(
                  e,
                  "/admin/pause",
                  { paused: !paused },
                  paused ? "活动已恢复" : "活动已停表",
                )
              }
            >
              {paused ? <Play size={17} /> : <Pause size={17} />}{" "}
              {paused ? "恢复活动" : "暂时停表"}
            </Button>
            <Button
              variant="dark"
              disabled={busy || final}
              onClick={() => setFinalConfirm(true)}
            >
              <Lock size={17} />
              {final ? "已最终结榜" : "结束活动并结榜"}
            </Button>
          </div>
          {finalConfirm && (
            <div className="final-confirm" role="alert">
              <b>确认锁定今天所有成绩？</b>
              <p>结榜后不能恢复填报，最终榜将用于晚饭投屏。</p>
              <Button
                variant="danger"
                disabled={busy}
                onClick={(e) =>
                  action(
                    e,
                    "/admin/finalize",
                    {},
                    "最终榜已锁定，感谢今天的每一份坚持",
                  )
                }
              >
                确认最终结榜
              </Button>
              <button onClick={() => setFinalConfirm(false)}>先不结榜</button>
            </div>
          )}
          <a
            className="download-live"
            href={final ? "#screen?report=" + data.activity.finalId : "#screen"}
          >
            <Monitor size={17} />
            打开{final ? "最终榜" : "实时榜"}投屏
          </a>
        </section>
      </div>
      <section className="card reports-card">
        <Heading title="已经保存的战报">
          <span className="subtle">{data.reports.length} 份</span>
        </Heading>
        {!data.reports.length ? (
          <Empty title="第一份战报，等你生成" />
        ) : (
          <div className="report-list">
            {data.reports.map((r) => (
              <div className="report-row" key={r.id}>
                <span className={"report-icon " + r.kind}>
                  {r.kind === "final" ? (
                    <Trophy size={23} />
                  ) : (
                    <ClipboardList size={23} />
                  )}
                </span>
                <div>
                  <b>{r.title}</b>
                  <small>
                    {time(r.created)} ·{" "}
                    {r.kind === "final"
                      ? "最终结果，已锁定"
                      : "阶段快照，固定成绩"}
                  </small>
                </div>
                <a
                  className="btn outline"
                  href={apiBase + "/admin/export?report=" + r.id}
                >
                  <Download size={16} />
                  下载 CSV
                </a>
                <a className="btn" href={"#screen?report=" + r.id}>
                  <Monitor size={16} />
                  投屏
                </a>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="card">
        <Heading title="各赛道参与情况">
          <button className="text-link" onClick={load}>
            <RefreshCw size={15} />
            刷新
          </button>
        </Heading>
        <div className="participation-grid">
          {data.tracks.map((t) => {
            const rows = data.boards[t.id].personal;
            return (
              <div key={t.id}>
                <TrackPill track={t} />
                <b>
                  {rows.length}
                  <small>人报名</small>
                </b>
                <span>{rows.filter((u) => u.checked).length} 人完成打卡</span>
              </div>
            );
          })}
        </div>
        <h3 className="small-heading">参赛名单 · 原始体重仅管理端可见</h3>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>昵称</th>
                <th>队伍</th>
                <th>报名项目</th>
                <th>最新记录</th>
                <th>核对凭证</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {u.demo ? "（体验）" : ""}
                  </td>
                  <td>
                    {data.teams.filter(t=>u.team_ids?.[t.track]===t.id).map(t=>`${data.tracks.find(tr=>tr.id===t.track)?.short}：${t.name}`).join(" / ") || "个人参赛"}
                  </td>
                  <td>
                    {u.tracks
                      .map((id) => data.tracks.find((t) => t.id === id)?.short)
                      .join(" / ")}
                  </td>
                  <td>
                    {u.records.map((r) => {
                      const t = data.tracks.find((t) => t.id === r.track);
                      return (
                        <div key={r.track}>
                          {t.short}：
                          {t.weight
                            ? `${r.morning} → ${r.evening ?? "待晚称"} 斤`
                            : `${fmt(r.value)} ${t.unit}`}
                        </div>
                      );
                    })}
                  </td>
                  <td><EvidenceGallery items={u.evidence || []} tracks={data.tracks} title="查看凭证"/>{!u.evidence?.length && <span className="subtle">暂无图片</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function Screen({ data }) {
  const params = new URLSearchParams(location.hash.split("?")[1] || ""),
    reportId = params.get("report");
  const [report, setReport] = useState(null),
    [error, setError] = useState(""),
    [track, setTrack] = useState("steps"),
    [type, setType] = useState("combined"),
    [auto, setAuto] = useState(false);
  useEffect(() => {
    setReport(null);
    setError("");
    if (reportId)
      api("/reports/" + encodeURIComponent(reportId))
        .then(setReport)
        .catch((e) => setError(e.message));
  }, [reportId]);
  const display = report || data;
  useEffect(() => {
    if (!auto) return;
    const ids = ["steps", "loss", "gain", "smoke", "water"];
    const timer = setInterval(
      () => setTrack((t) => ids[(ids.indexOf(t) + 1) % 5]),
      10000,
    );
    return () => clearInterval(timer);
  }, [auto]);
  if (error)
    return (
      <div className="loading">
        <p>{error}</p>
        <a href="#leaderboard">返回榜单</a>
      </div>
    );
  if (reportId && !report)
    return (
      <div className="loading">
        <LoaderCircle className="spin" />
        正在读取固定战报…
      </div>
    );
  const t = display.tracks.find((t) => t.id === track),
    rows = boardRows(display.boards[track], type);
  return (
    <div className="screen">
      <header>
        <Logo />
        <span>
          {display.activity.date} ·{" "}
          {report
            ? report.kind === "final"
              ? "最终结榜"
              : "阶段战报"
            : "实时榜单"}
        </span>
        <a href="#admin">
          返回管理
          <ArrowUpRight size={16} />
        </a>
      </header>
      <section className="screen-heading">
        <span className="eyebrow">
          TODAY’S LITTLE EFFORTS. BIG GOOD ENERGY.
        </span>
        <h1>{report?.title || "今天的好状态，值得被看见。"}</h1>
        <p>
          {report
            ? `成绩固定于 ${time(report.created)}，后续更新不改变此战报`
            : "每 15 秒更新 · 五个赛道独立排名 · 不设跨项目总分"}
          {display.demo ? " · 含体验数据" : ""}
        </p>
      </section>
      <div className="screen-tools">
        <TrackTabs
          tracks={display.tracks}
          selected={track}
          onSelect={setTrack}
        />
        <RankTabs value={type} onChange={setType} />
        <label>
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          自动轮播
        </label>
        <button
          className="icon-button"
          aria-label="全屏投屏"
          onClick={() =>
            document.documentElement.requestFullscreen?.().catch(() => {})
          }
        >
          <Maximize size={20} />
        </button>
      </div>
      <div className="screen-label">
        <TrackPill track={t} />
        <span>
          {type === "combined" ? "个人成绩 / 团队人均" : type === "team"
            ? "团队人均成绩" : "个人成绩"}{" "}
          · 目标 {t.goal} {t.unit}
        </span>
      </div>
      {!rows.length ? (
        <Empty title="这条赛道暂无报名，期待下一次一起出发" />
      ) : (
        <>
          <div className="podium">
            {[1, 0, 2].map((index) => {
              const u = rows[index];
              return (
                u && (
                  <div className={"podium-item position-" + index} key={`${u.kind || type}:${u.id}`}>
                    <span className="podium-crown">
                      {u.rank === 1 ? <Trophy size={28} /> : String(u.rank).padStart(2, "0")}
                    </span>
                    <Avatar name={u.name} color={u.color} />
                    <h2>{u.name}</h2>
                    <b>
                      {fmt(u.score)}
                      <small>
                        {t.unit}
                        {type === "team" || u.kind === "team" ? "/人" : ""}
                      </small>
                    </b>
                    <p>
                      {type === "combined" && `${u.kind === "team" ? "团队" : "个人"} · `}
                      {rankStatus(u, type === "team" || u.kind === "team")} · 第 {u.rank} 名
                    </p>
                  </div>
                )
              );
            })}
          </div>
          {rows.length > 3 && (
            <section className="screen-rest">
              <LeaderTable rows={rows.slice(3)} track={t} type={type} />
            </section>
          )}
        </>
      )}
      <footer>
        每一步，每一杯，每一份坚持。<b>谢谢今天一起跃动的你。</b>
        <span>MOVE TOGETHER</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
