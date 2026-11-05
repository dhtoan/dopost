// Callouts for the README tour. Boxes are [x, y, width, height] in the
// 2000-pixel-wide space of assets/screenshots/<source>-light.webp.
export const languages = ["en", "vi"];

export const screens = [
  {
    id: "01-compose",
    source: "main",
    en: {
      eyebrow: "Publishing",
      title: "Write once, tailor it for every channel",
      summary:
        "The composer keeps one post per idea and lets you adjust it for each connected account before it goes out.",
    },
    vi: {
      eyebrow: "Đăng bài",
      title: "Viết một lần, chỉnh riêng cho từng kênh",
      summary:
        "Trình soạn thảo giữ một bài cho mỗi ý tưởng và cho phép chỉnh lại theo từng tài khoản trước khi đăng.",
    },
    callouts: [
      {
        box: [10, 135, 318, 440],
        en: {
          title: "Workspace navigation",
          text: "Home, Posts, Inbox, Analytics, Ideas, Studio, Media and Automations in one sidebar.",
        },
        vi: {
          title: "Điều hướng workspace",
          text: "Trang chủ, Bài đăng, Hộp thư, Phân tích, Ý tưởng, Studio, Media và Tự động hoá trong một thanh bên.",
        },
      },
      {
        box: [355, 15, 350, 54],
        en: {
          title: "Destinations",
          text: "Pick the accounts or a saved group, such as Shortform writing, to post to.",
        },
        vi: {
          title: "Nơi đăng",
          text: "Chọn các tài khoản hoặc một nhóm đã lưu (ví dụ Shortform writing) để đăng lên.",
        },
      },
      {
        box: [486, 122, 872, 60],
        en: {
          title: "Per-account versions",
          text: "All edits every channel at once; a tab per account changes only that version. Badges count open issues.",
        },
        vi: {
          title: "Phiên bản theo tài khoản",
          text: "Tab All sửa cho mọi kênh; mỗi tab tài khoản chỉ đổi phiên bản đó. Số đỏ là các lỗi cần xử lý.",
        },
      },
      {
        box: [486, 210, 872, 780],
        en: {
          title: "Text and media",
          text: "Write the post and attach images, video, GIFs or a meme made from a template, with text overlays.",
        },
        vi: {
          title: "Nội dung và media",
          text: "Viết bài và đính kèm ảnh, video, GIF hoặc meme làm từ mẫu, có thể chèn chữ lên ảnh.",
        },
      },
      {
        box: [490, 1000, 330, 46],
        en: {
          title: "Post tools",
          text: "Add media or a poll, watch the character count against the network's limit, and start a thread with Add post.",
        },
        vi: {
          title: "Công cụ bài đăng",
          text: "Thêm media hoặc bình chọn, theo dõi số ký tự so với giới hạn của mạng, và tạo chuỗi bài bằng Add post.",
        },
      },
      {
        box: [1250, 1000, 106, 46],
        en: {
          title: "Ideas",
          text: "AI suggestions and alternative versions of the post.",
        },
        vi: {
          title: "Ý tưởng",
          text: "Gợi ý bằng AI và các phiên bản khác của bài.",
        },
      },
      {
        box: [1712, 18, 268, 50],
        en: {
          title: "Schedule",
          text: "Queue the post in the next free slot; the arrow next to it opens the other publishing options.",
        },
        vi: {
          title: "Lên lịch",
          text: "Xếp bài vào khung giờ trống kế tiếp; mũi tên bên cạnh mở các lựa chọn đăng khác.",
        },
      },
      {
        box: [1530, 185, 452, 670],
        en: {
          title: "Live preview",
          text: "Shows how the selected network will display the post, including truncation and media crops.",
        },
        vi: {
          title: "Xem trước trực tiếp",
          text: "Hiển thị bài đúng như mạng xã hội đang chọn sẽ hiển thị, kể cả chỗ bị cắt chữ và cắt ảnh.",
        },
      },
    ],
  },
  {
    id: "02-calendar",
    source: "calendar",
    en: {
      eyebrow: "Planning",
      title: "See the whole month at a glance",
      summary:
        "Scheduled, published and draft posts on one calendar, with the accounts each one goes to.",
    },
    vi: {
      eyebrow: "Lập kế hoạch",
      title: "Nhìn cả tháng chỉ trong một màn hình",
      summary:
        "Bài đã lên lịch, đã đăng và bản nháp nằm chung một lịch, kèm các tài khoản mà mỗi bài sẽ đăng lên.",
    },
    callouts: [
      {
        box: [458, 150, 416, 62],
        en: {
          title: "Views",
          text: "Switch between a list, a grid of post cards and the calendar.",
        },
        vi: {
          title: "Kiểu xem",
          text: "Chuyển giữa danh sách, lưới thẻ bài và lịch.",
        },
      },
      {
        box: [462, 228, 328, 50],
        en: {
          title: "Month navigation",
          text: "Step through months or jump back to today.",
        },
        vi: {
          title: "Chuyển tháng",
          text: "Đi tới tháng trước, tháng sau hoặc quay về hôm nay.",
        },
      },
      {
        box: [1518, 228, 360, 50],
        en: {
          title: "Range and filters",
          text: "Month or week view, filters for the posts shown, and refresh.",
        },
        vi: {
          title: "Phạm vi và bộ lọc",
          text: "Xem theo tháng hoặc tuần, lọc các bài hiển thị, và làm mới.",
        },
      },
      {
        box: [870, 565, 186, 85],
        en: {
          title: "Posts on the day",
          text: "Each entry shows the post, the accounts it goes to and its time.",
        },
        vi: {
          title: "Bài trong ngày",
          text: "Mỗi mục hiển thị bài, các tài khoản sẽ đăng lên và giờ đăng.",
        },
      },
      {
        box: [1276, 874, 186, 94],
        en: {
          title: "Upcoming posts",
          text: "Posts still to go out. Open one to edit or reschedule it.",
        },
        vi: {
          title: "Bài sắp đăng",
          text: "Các bài chưa đăng. Mở ra để sửa hoặc đổi lịch.",
        },
      },
    ],
  },
  {
    id: "03-analytics",
    source: "analytics",
    en: {
      eyebrow: "Analytics",
      title: "Measure what your posts did",
      summary:
        "Visibility, engagement and follower growth across every connected account, with exports for reporting.",
    },
    vi: {
      eyebrow: "Phân tích",
      title: "Đo hiệu quả của từng bài đăng",
      summary:
        "Lượt hiển thị, tương tác và tăng trưởng người theo dõi trên mọi tài khoản đã kết nối, xuất ra được để báo cáo.",
    },
    callouts: [
      {
        box: [1358, 45, 354, 54],
        en: {
          title: "Accounts and range",
          text: "One account or all of them, over a number of days, last year, all time or a custom range.",
        },
        vi: {
          title: "Tài khoản và khoảng thời gian",
          text: "Một hoặc tất cả tài khoản, theo số ngày, năm trước, toàn bộ thời gian hoặc khoảng tuỳ chọn.",
        },
      },
      {
        box: [1720, 45, 50, 54],
        en: {
          title: "Export",
          text: "Download CSV, Excel with charts, or JSON, grouped by post, day, week, month, platform or account.",
        },
        vi: {
          title: "Xuất dữ liệu",
          text: "Tải CSV, Excel kèm biểu đồ hoặc JSON, nhóm theo bài, ngày, tuần, tháng, nền tảng hoặc tài khoản.",
        },
      },
      {
        box: [452, 148, 525, 62],
        en: {
          title: "Coverage",
          text: "States how many accounts and destinations actually report data, so gaps are visible.",
        },
        vi: {
          title: "Độ phủ dữ liệu",
          text: "Cho biết bao nhiêu tài khoản và nơi đăng thực sự trả về số liệu, để thấy rõ chỗ thiếu.",
        },
      },
      {
        box: [453, 238, 1426, 172],
        en: {
          title: "Headline metrics",
          text: "Visibility (impressions plus video views), engagement, followers with growth, and posts published.",
        },
        vi: {
          title: "Chỉ số chính",
          text: "Lượt hiển thị (impression cộng lượt xem video), tương tác, người theo dõi kèm mức tăng, và số bài đã đăng.",
        },
      },
      {
        box: [453, 438, 1426, 456],
        en: {
          title: "Daily trend",
          text: "The selected metric per day, stacked by account colour.",
        },
        vi: {
          title: "Xu hướng theo ngày",
          text: "Chỉ số đang chọn theo từng ngày, chồng theo màu của từng tài khoản.",
        },
      },
      {
        box: [453, 925, 1426, 340],
        en: {
          title: "Audience by account",
          text: "Where your followers are, network by network.",
        },
        vi: {
          title: "Khán giả theo tài khoản",
          text: "Người theo dõi của bạn nằm ở đâu, theo từng mạng xã hội.",
        },
      },
    ],
  },
  {
    id: "04-workflows",
    source: "workflows",
    en: {
      eyebrow: "Automations",
      title: "Turn routine posting into a workflow",
      summary:
        "A visual editor for automations that start from a trigger, branch on conditions and keep a human in the loop.",
    },
    vi: {
      eyebrow: "Tự động hoá",
      title: "Biến việc đăng bài lặp lại thành quy trình",
      summary:
        "Trình soạn quy trình trực quan: bắt đầu từ một sự kiện, rẽ nhánh theo điều kiện và vẫn có người duyệt.",
    },
    callouts: [
      {
        box: [165, 670, 216, 78],
        en: {
          title: "Trigger",
          text: "Starts the workflow: a GitHub release, an RSS item or a published post.",
        },
        vi: {
          title: "Sự kiện kích hoạt",
          text: "Điểm bắt đầu quy trình: một bản phát hành GitHub, một mục RSS hoặc một bài vừa đăng.",
        },
      },
      {
        box: [456, 670, 270, 78],
        en: {
          title: "Condition",
          text: "Branches into Yes and No paths, here on whether the release has breaking changes.",
        },
        vi: {
          title: "Điều kiện",
          text: "Rẽ thành nhánh Có và Không, ở đây là bản phát hành có thay đổi phá vỡ tương thích hay không.",
        },
      },
      {
        box: [746, 434, 216, 78],
        en: {
          title: "AI steps",
          text: "Write or transform text with AI, such as explaining a migration or shortening notes.",
        },
        vi: {
          title: "Bước AI",
          text: "Viết hoặc biến đổi văn bản bằng AI, như giải thích cách nâng cấp hay rút gọn ghi chú.",
        },
      },
      {
        box: [1327, 434, 216, 78],
        en: {
          title: "Approval",
          text: "Pauses until a person reviews the draft.",
        },
        vi: {
          title: "Duyệt bài",
          text: "Tạm dừng cho tới khi có người xem lại bản nháp.",
        },
      },
      {
        box: [1618, 434, 216, 78],
        en: {
          title: "Publishing actions",
          text: "Schedule the post, create a draft or add a tracking link.",
        },
        vi: {
          title: "Hành động đăng",
          text: "Lên lịch bài, tạo bản nháp hoặc gắn link theo dõi.",
        },
      },
      {
        box: [1658, 1246, 324, 72],
        en: {
          title: "Test before going live",
          text: "Run a preview with sample data and see each step's output.",
        },
        vi: {
          title: "Chạy thử trước khi bật",
          text: "Chạy xem trước với dữ liệu mẫu và xem kết quả của từng bước.",
        },
      },
      {
        box: [1793, 18, 190, 48],
        en: {
          title: "Publish workflow",
          text: "Turns the workflow on; Runs lists every past run.",
        },
        vi: {
          title: "Bật quy trình",
          text: "Đưa quy trình vào hoạt động; tab Runs liệt kê mọi lần đã chạy.",
        },
      },
    ],
  },
  {
    id: "05-video-editor",
    source: "video-editor",
    en: {
      eyebrow: "Video Editor",
      title: "A full timeline editor in the browser",
      summary:
        "Multitrack editing, transcripts, captions, effects and export, rendered on your device.",
    },
    vi: {
      eyebrow: "Trình dựng video",
      title: "Trình dựng timeline đầy đủ ngay trên trình duyệt",
      summary:
        "Dựng nhiều track, bản chép lời, phụ đề, hiệu ứng và xuất video, xử lý ngay trên máy của bạn.",
    },
    callouts: [
      {
        box: [838, 8, 324, 50],
        en: {
          title: "Workspaces",
          text: "Edit for cutting, Color for grading, Motion for animated compositions.",
        },
        vi: {
          title: "Chế độ làm việc",
          text: "Edit để cắt ghép, Color để chỉnh màu, Motion cho các bố cục chuyển động.",
        },
      },
      {
        box: [6, 75, 50, 300],
        en: {
          title: "Panels",
          text: "Media, text, captions, effects and more.",
        },
        vi: {
          title: "Bảng công cụ",
          text: "Media, chữ, phụ đề, hiệu ứng và nhiều mục khác.",
        },
      },
      {
        box: [64, 72, 400, 390],
        en: {
          title: "Media",
          text: "Project media, scenes and stock. Import files or links, generate video with AI or remove a background.",
        },
        vi: {
          title: "Media",
          text: "Media của dự án, cảnh và kho có sẵn. Nhập file hoặc link, tạo video bằng AI hay xoá phông.",
        },
      },
      {
        box: [480, 196, 1062, 602],
        en: {
          title: "Preview",
          text: "Move, crop and rotate directly on the frame, with optional safe-area and thirds guides.",
        },
        vi: {
          title: "Khung xem trước",
          text: "Di chuyển, cắt và xoay ngay trên khung hình, có thể bật lưới chia ba và vùng an toàn.",
        },
      },
      {
        box: [1408, 10, 48, 48],
        en: {
          title: "Editing assistant",
          text: "Ask the assistant to cut, caption or rearrange the project.",
        },
        vi: {
          title: "Trợ lý dựng",
          text: "Nhờ trợ lý cắt, làm phụ đề hoặc sắp xếp lại dự án.",
        },
      },
      {
        box: [1558, 72, 440, 890],
        en: {
          title: "Inspector",
          text: "Properties, animation, effects and transcript of the selected clip, including audio gain and fades.",
        },
        vi: {
          title: "Bảng thuộc tính",
          text: "Thuộc tính, chuyển động, hiệu ứng và bản chép lời của clip đang chọn, cả âm lượng và fade.",
        },
      },
      {
        box: [466, 1078, 1532, 220],
        en: {
          title: "Timeline",
          text: "Visual and audio tracks with waveforms, markers, snapping, keyframes and zoom.",
        },
        vi: {
          title: "Timeline",
          text: "Các track hình và tiếng kèm dạng sóng, điểm đánh dấu, hút cạnh, keyframe và phóng to.",
        },
      },
      {
        box: [1864, 8, 120, 50],
        en: {
          title: "Export",
          text: "Render the sequence to a file or a queue.",
        },
        vi: {
          title: "Xuất video",
          text: "Kết xuất sequence ra file hoặc đưa vào hàng đợi.",
        },
      },
    ],
  },
  {
    id: "06-color",
    source: "video-color",
    en: {
      eyebrow: "Color",
      title: "Grade with scopes, wheels and keyframes",
      summary:
        "The Color workspace gives each clip a stack of corrections you can compare, keyframe and copy.",
    },
    vi: {
      eyebrow: "Chỉnh màu",
      title: "Chỉnh màu với scope, bánh xe màu và keyframe",
      summary:
        "Chế độ Color cho mỗi clip một chồng lớp chỉnh màu, có thể so sánh, đặt keyframe và sao chép.",
    },
    callouts: [
      {
        box: [1505, 78, 488, 636],
        en: {
          title: "Scopes",
          text: "RGB parade, waveform, vectorscope or histogram, alone or as a grid.",
        },
        vi: {
          title: "Scope",
          text: "RGB parade, waveform, vectorscope hoặc histogram, xem riêng hoặc dạng lưới.",
        },
      },
      {
        box: [4, 768, 122, 74],
        en: {
          title: "Clip strip",
          text: "Every clip in the sequence, so you can move from shot to shot.",
        },
        vi: {
          title: "Dải clip",
          text: "Mọi clip trong sequence để chuyển qua lại giữa các cảnh.",
        },
      },
      {
        box: [212, 725, 336, 38],
        en: {
          title: "Correction tools",
          text: "Primaries plus curves, qualifiers, power windows and layered corrections.",
        },
        vi: {
          title: "Công cụ chỉnh",
          text: "Primaries cùng đường cong, chọn vùng màu, mặt nạ vùng và các lớp chỉnh.",
        },
      },
      {
        box: [1736, 846, 254, 38],
        en: {
          title: "Compare",
          text: "After, Before or a split view of the grade.",
        },
        vi: {
          title: "So sánh",
          text: "Xem sau khi chỉnh, trước khi chỉnh hoặc chia đôi màn hình.",
        },
      },
      {
        box: [8, 928, 1986, 282],
        en: {
          title: "Color wheels",
          text: "Lift, gamma, gain and offset, each with per-channel values.",
        },
        vi: {
          title: "Bánh xe màu",
          text: "Lift, gamma, gain và offset, mỗi bánh có giá trị riêng cho từng kênh.",
        },
      },
      {
        box: [238, 1228, 1664, 64],
        en: {
          title: "Primary sliders",
          text: "Temperature, tint, contrast, pivot and detail, then boost, shadows, highlights, saturation and hue.",
        },
        vi: {
          title: "Thanh chỉnh cơ bản",
          text: "Nhiệt độ màu, tint, tương phản, pivot và chi tiết, rồi boost, vùng tối, vùng sáng, bão hoà và hue.",
        },
      },
      {
        box: [1578, 725, 414, 38],
        en: {
          title: "Keyframes, scopes and target",
          text: "Show keyframes or scopes, and switch between the clip grade and the sequence grade.",
        },
        vi: {
          title: "Keyframe, scope và đối tượng",
          text: "Hiện keyframe hoặc scope, và chuyển giữa chỉnh màu cho clip và cho cả sequence.",
        },
      },
    ],
  },
  {
    id: "07-export",
    source: "video-export",
    en: {
      eyebrow: "Export",
      title: "Export for archive, web or social",
      summary:
        "Presets cover the common targets; every setting stays visible and editable before you render.",
    },
    vi: {
      eyebrow: "Xuất video",
      title: "Xuất bản lưu trữ, bản web hoặc bản mạng xã hội",
      summary:
        "Các preset có sẵn cho nhu cầu phổ biến; mọi thiết lập vẫn hiện rõ và sửa được trước khi render.",
    },
    callouts: [
      {
        box: [704, 281, 590, 156],
        en: {
          title: "Sequence",
          text: "Choose which sequence to export, with its size, frame rate and length.",
        },
        vi: {
          title: "Sequence",
          text: "Chọn sequence cần xuất, kèm kích thước, tốc độ khung hình và độ dài.",
        },
      },
      {
        box: [704, 483, 584, 50],
        en: {
          title: "Presets",
          text: "Master / Archive, Web 1080p, Social and Draft preview.",
        },
        vi: {
          title: "Preset",
          text: "Master / Lưu trữ, Web 1080p, Mạng xã hội và Bản nháp xem thử.",
        },
      },
      {
        box: [704, 550, 590, 176],
        en: {
          title: "Format and quality",
          text: "Container, codec, quality and resolution.",
        },
        vi: {
          title: "Định dạng và chất lượng",
          text: "Định dạng file, codec, chất lượng và độ phân giải.",
        },
      },
      {
        box: [704, 740, 290, 80],
        en: {
          title: "Subtitles",
          text: "Burn captions into the picture, embed them as a track, save an SRT file, or leave them out.",
        },
        vi: {
          title: "Phụ đề",
          text: "In phụ đề lên hình, nhúng thành track, lưu file SRT, hoặc bỏ qua.",
        },
      },
      {
        box: [704, 956, 590, 86],
        en: {
          title: "Estimate",
          text: "Length, expected file size and whether it renders in the background.",
        },
        vi: {
          title: "Ước tính",
          text: "Thời lượng, dung lượng dự kiến và có render nền hay không.",
        },
      },
      {
        box: [916, 1073, 380, 54],
        en: {
          title: "Render or queue",
          text: "Render now, or add the export to a queue and keep editing.",
        },
        vi: {
          title: "Render hoặc xếp hàng",
          text: "Render ngay, hoặc đưa vào hàng đợi rồi tiếp tục dựng.",
        },
      },
      {
        box: [73, 203, 380, 50],
        en: {
          title: "Auto-captions",
          text: "Transcribe speech on the device, with the language detected or chosen.",
        },
        vi: {
          title: "Phụ đề tự động",
          text: "Chép lời ngay trên máy, tự nhận diện ngôn ngữ hoặc chọn sẵn.",
        },
      },
    ],
  },
  {
    id: "08-image-editor",
    source: "image-editor",
    en: {
      eyebrow: "Image Editor",
      title: "Design graphics without leaving the workspace",
      summary:
        "Layers, AI edits and one-click looks for banners, thumbnails and post images.",
    },
    vi: {
      eyebrow: "Trình sửa ảnh",
      title: "Thiết kế đồ hoạ ngay trong workspace",
      summary:
        "Lớp, chỉnh ảnh bằng AI và bộ màu một chạm cho banner, thumbnail và ảnh bài đăng.",
    },
    callouts: [
      {
        box: [352, 12, 414, 42],
        en: {
          title: "Menus",
          text: "File, edit, layer, select, tools, view and help, with keyboard shortcuts.",
        },
        vi: {
          title: "Menu",
          text: "File, chỉnh sửa, lớp, chọn, công cụ, hiển thị và trợ giúp, có phím tắt.",
        },
      },
      {
        box: [6, 76, 50, 400],
        en: {
          title: "Tools",
          text: "Add, select, crop, text, shapes, drawing and more.",
        },
        vi: {
          title: "Công cụ",
          text: "Thêm, chọn, cắt, chữ, hình khối, vẽ và nhiều công cụ khác.",
        },
      },
      {
        box: [73, 78, 444, 934],
        en: {
          title: "Media",
          text: "Drop images from the workspace library onto the canvas.",
        },
        vi: {
          title: "Media",
          text: "Kéo ảnh từ thư viện của workspace thả vào canvas.",
        },
      },
      {
        box: [515, 441, 987, 467],
        en: {
          title: "Canvas",
          text: "Any size, such as a 1500 × 500 X banner, with several pages per design.",
        },
        vi: {
          title: "Canvas",
          text: "Kích thước tuỳ ý, ví dụ banner X 1500 × 500, mỗi thiết kế có nhiều trang.",
        },
      },
      {
        box: [1560, 72, 436, 100],
        en: {
          title: "Layers",
          text: "Reorder, hide and lock layers, including animated GIF layers.",
        },
        vi: {
          title: "Lớp",
          text: "Sắp xếp, ẩn và khoá lớp, kể cả lớp GIF động.",
        },
      },
      {
        box: [1571, 674, 413, 52],
        en: {
          title: "AI edit image",
          text: "Describe a change and let AI edit or extend the selected image.",
        },
        vi: {
          title: "Sửa ảnh bằng AI",
          text: "Mô tả thay đổi để AI chỉnh sửa hoặc mở rộng ảnh đang chọn.",
        },
      },
      {
        box: [1571, 963, 413, 124],
        en: {
          title: "Quick looks",
          text: "Original, Crisp, Warm, Cool and Mono in one click.",
        },
        vi: {
          title: "Bộ màu nhanh",
          text: "Gốc, Sắc nét, Ấm, Lạnh và Đơn sắc chỉ với một chạm.",
        },
      },
      {
        box: [1571, 1094, 413, 236],
        en: {
          title: "Adjustments",
          text: "Brightness, exposure, contrast and more, each resettable.",
        },
        vi: {
          title: "Tinh chỉnh",
          text: "Độ sáng, phơi sáng, tương phản và nhiều thông số khác, đều đặt lại được.",
        },
      },
    ],
  },
];
