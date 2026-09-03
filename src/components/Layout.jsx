  const fullName =
    String(user?.full_name || user?.name || "Natasha Ulery").trim();

  const email = user?.email || "";

  const isActive = (to, label) => {
    if (label === "Integrations") return false;
    if (label === "Settings") return pathname === "/account";

    if (to === "/") {
      return pathname === "/";
    }

    return pathname === to || pathname.startsWith(`${to}/`);
  };

  useEffect(() => {
    if (!tabPaths.has(pathname)) return;

    const onScroll = () => {
      scrollPositions.current[pathname] = window.scrollY;
    };

    onScroll();

    window.addEventListener("scroll", onScroll, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);

  useEffect(() => {
    if (!tabPaths.has(pathname)) return;

    const savedPosition =
      scrollPositions.current[pathname] ?? 0;

    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, savedPosition);
    });

    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  const handleSearch = (event) => {
    if (event.key === "Enter") {
      const value = event.currentTarget.value.trim();

      if (!value) return;

      navigate(
        `/orders?search=${encodeURIComponent(value)}`
      );
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-50 w-[270px] flex-col p-3">
        <div className="h-full rounded-[26px] border border-white/60 bg-white/72 dark:bg-slate-950/70 backdrop-blur-2xl shadow-[0_18px_60px_rgba(106,76,160,0.15)] flex flex-col overflow-hidden">

          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-3 px-5 pt-5 pb-4 text-left"
          >
            <div className="w-12 h-12 flex items-center justify-center shrink-0">
              <Logo size={46} />
            </div>

            <div className="min-w-0">
              <div className="font-heading text-[22px] font-semibold tracking-[0.02em] text-[#594187] dark:text-purple-200 leading-none">
                ART FLOW
              </div>

              <div className="text-[11px] tracking-[0.34em] text-[#7f6b9e] dark:text-purple-300 mt-1">
                CREATIVE
              </div>
            </div>
          </button>

          <nav className="px-3 pt-2 space-y-1">
            {navItems.map(
              ({ label, to, icon: Icon, badge }) => {
                const active = isActive(to, label);

                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => navigate(to)}
                    className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[14px] font-medium transition-all ${
                      active
                        ? "bg-gradient-to-r from-[#d9c2ff] to-[#e9d8ff] text-[#4f2f81] shadow-[0_8px_24px_rgba(147,105,210,0.16)]"
                        : "text-[#302747] dark:text-slate-300 hover:bg-white/60 dark:hover:bg-white/5"
                    }`}
                  >                    <Icon
                      className={`w-[19px] h-[19px] ${
                        active
                          ? "text-[#6f43b5]"
                          : "text-[#6f6190] dark:text-slate-400"
                      }`}
                      strokeWidth={1.8}
                    />

                    <span>{label}</span>

                    {badge && (
                      <span className="ml-auto rounded-full border border-pink-300 bg-pink-50 px-2 py-0.5 text-[9px] font-semibold text-pink-500">
                        {badge}
                      </span>
                    )}
                  </button>
                );
              }
            )}
          </nav>

          <div className="flex-1" />

          <div className="mx-3 mb-3 rounded-[20px] border border-purple-100 bg-white/65 dark:bg-white/5 p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-[#7550b7]" />

              <span className="text-[12px] font-semibold">
                Sync Status
              </span>
            </div>

            <div className="flex items-center justify-between mt-3 text-[11px]">
              <span className="text-muted-foreground">
                Last synced
              </span>

              <span className="font-semibold">
                2 min ago
              </span>
            </div>

            <div className="border-t border-purple-100/70 my-3" />

            <div className="flex items-center gap-2 text-[11px] text-emerald-600 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              All Connected
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/account")}
            className="mx-3 mb-3 rounded-[20px] border border-purple-100 bg-white/68 dark:bg-white/5 p-3 flex items-center gap-3 text-left shadow-sm"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 via-pink-400 to-cyan-300 flex items-center justify-center text-white font-semibold">
              {firstName.slice(0, 1).toUpperCase()}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold truncate">
                {fullName}
              </p>

              <p className="text-[10px] text-muted-foreground truncate">
                {email}
              </p>
            </div>

            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="mx-3 mb-3 rounded-[20px] border border-purple-100 bg-white/68 dark:bg-white/5 p-3 shadow-sm">
            <div className="flex items-center">
              <span className="text-[11px] font-medium">
                Theme
              </span>

              <div className="ml-auto flex items-center rounded-xl bg-[#eee4fb] dark:bg-white/5 p-1">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`w-9 h-8 rounded-lg flex items-center justify-center ${
                    theme !== "dark"
                      ? "bg-white text-[#6c47aa] shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  <Sun className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`w-9 h-8 rounded-lg flex items-center justify-center ${
                    theme === "dark"
                      ? "bg-[#6c47aa] text-white shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  <Moon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => logout(true)}
            className="mx-3 mb-4 flex items-center gap-3 rounded-2xl px-4 py-3 text-[12px] font-medium text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-500/10"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </aside>      <div className="lg:ml-[270px] min-h-screen">
        <header className="hidden lg:flex sticky top-0 z-30 items-center gap-4 px-7 xl:px-10 pt-5 pb-3 bg-transparent">
          <div className="ml-auto flex items-center gap-3">
            <div className="w-[390px] max-w-[34vw] h-11 rounded-full border border-white/70 bg-white/72 dark:bg-slate-950/60 backdrop-blur-xl shadow-[0_8px_28px_rgba(99,75,145,0.12)] flex items-center px-4">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />

              <input
                type="search"
                placeholder="Search orders, listings, expenses..."
                onKeyDown={handleSearch}
                className="flex-1 bg-transparent border-0 outline-none px-3 text-[12px] placeholder:text-muted-foreground"
              />

              <div className="rounded-lg bg-purple-50 dark:bg-white/5 px-2 py-1 text-[10px] text-muted-foreground">
                ⌘ K
              </div>
            </div>

            <button
              type="button"
              className="relative w-11 h-11 rounded-2xl border border-white/70 bg-white/72 dark:bg-slate-950/60 backdrop-blur-xl shadow-[0_8px_28px_rgba(99,75,145,0.12)] flex items-center justify-center"
            >
              <Bell className="w-[18px] h-[18px] text-[#5f477f]" />

              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-pink-500 text-white text-[10px] flex items-center justify-center">
                3
              </span>
            </button>
          </div>
        </header>

        <main className="max-w-[1700px] mx-auto px-4 sm:px-5 lg:px-7 xl:px-10 pb-28 lg:pb-10 overflow-x-hidden">
          {tabs.map(({ path, Comp }) => (
            <div
              key={path}
              style={{
                display:
                  pathname === path ? "block" : "none",
              }}
            >
              <Comp />
            </div>
          ))}

          {!tabPaths.has(pathname) && (
            <div
              key={pathname}
              className="screen-slide"
            >
              <Outlet />
            </div>
          )}
        </main>
      </div>

      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  );
}