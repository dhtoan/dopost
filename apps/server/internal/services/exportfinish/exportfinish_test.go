package exportfinish

import (
	"context"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func tempInput(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "input.mp4")
	require.NoError(t, os.WriteFile(path, []byte("rendered"), 0o600))
	return path
}

func waitFor(t *testing.T, service *Service, owner, id string) *Job {
	t.Helper()
	deadline := time.Now().Add(2 * time.Minute)
	for time.Now().Before(deadline) {
		job, err := service.Get(owner, id)
		require.NoError(t, err)
		if job.Status != StatusRunning {
			return job
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("job did not finish")
	return nil
}

func TestArgsKeepOneVideoAndOptionalAudioAndAddLoudness(t *testing.T) {
	target, ok := targetByID("hevc")
	require.True(t, ok)
	args := Args(target, true, "in.mp4", "out.mp4")
	require.Equal(t, []string{"-map", "0:v:0", "-map", "0:a:0?"}, args[5:9])
	require.Contains(t, args, "libx265")
	require.Contains(t, args, loudnessFilter)
	require.Equal(t, "out.mp4", args[len(args)-1])
	require.NotContains(t, Args(target, false, "in.mp4", "out.mp4"), loudnessFilter)
}

func TestReadProgressReportsShareOfDuration(t *testing.T) {
	var seen []float64
	readProgress(strings.NewReader("frame=1\nout_time_us=500000\nout_time_us=bad\nout_time_us=2000000\nprogress=end\n"), 2, func(p float64) {
		seen = append(seen, p)
	})
	require.Equal(t, []float64{0.25, 0.99}, seen, "never 1 until the file is written")
}

func TestJobsBelongToTheirOwnerAndHoldASlot(t *testing.T) {
	release := make(chan struct{})
	service := New(Config{Enabled: true})
	service.run = func(_ context.Context, _ string, args []string, _ func(io.Reader)) error {
		<-release
		return os.WriteFile(args[len(args)-1], []byte("finished"), 0o600)
	}
	input := tempInput(t)
	job, err := service.Start("user-1", "h264-small", "Launch: cut?.mp4", false, input)
	require.NoError(t, err)
	require.Equal(t, "Launch cut.mp4", job.FileName)

	_, err = service.Get("user-2", job.ID)
	require.ErrorIs(t, err, ErrNotFound)
	_, _, err = service.Open("user-1", job.ID)
	require.ErrorIs(t, err, ErrNotReady)
	second := tempInput(t)
	_, err = service.Start("user-1", "hevc", "x", false, second)
	require.ErrorIs(t, err, ErrBusy)
	_, statErr := os.Stat(second)
	require.True(t, os.IsNotExist(statErr), "a refused upload is removed")

	close(release)
	done := waitFor(t, service, "user-1", job.ID)
	require.Equal(t, StatusDone, done.Status)
	_, statErr = os.Stat(input)
	require.True(t, os.IsNotExist(statErr), "the upload is removed once finished")

	_, file, err := service.Open("user-1", job.ID)
	require.NoError(t, err)
	body, _ := io.ReadAll(file)
	require.Equal(t, "finished", string(body))
	require.NoError(t, file.Close())
	_, err = service.Get("user-1", job.ID)
	require.ErrorIs(t, err, ErrNotFound, "a downloaded job is gone")
}

func TestStartRefusesWhenOffOrUnknown(t *testing.T) {
	_, err := New(Config{}).Start("u", "hevc", "x", false, tempInput(t))
	require.ErrorIs(t, err, ErrDisabled)
	_, err = New(Config{Enabled: true}).Start("u", "gif", "x", false, tempInput(t))
	require.ErrorIs(t, err, ErrUnknownTarget)
}

func TestCancelStopsFFmpegAndExpiredJobsGo(t *testing.T) {
	service := New(Config{Enabled: true, TTL: time.Minute})
	started := make(chan struct{})
	service.run = func(ctx context.Context, _ string, _ []string, _ func(io.Reader)) error {
		close(started)
		<-ctx.Done()
		return ctx.Err()
	}
	job, err := service.Start("u", "prores-hq", "x", false, tempInput(t))
	require.NoError(t, err)
	<-started
	require.NoError(t, service.Cancel("u", job.ID))
	_, err = service.Get("u", job.ID)
	require.ErrorIs(t, err, ErrNotFound)

	// The slot comes back once ffmpeg has stopped.
	require.Eventually(t, func() bool { return len(service.slots) == 0 }, time.Second, 10*time.Millisecond)

	service.run = func(_ context.Context, _ string, args []string, _ func(io.Reader)) error {
		return os.WriteFile(args[len(args)-1], []byte("x"), 0o600)
	}
	old, err := service.Start("u", "hevc", "x", false, tempInput(t))
	require.NoError(t, err)
	waitFor(t, service, "u", old.ID)
	service.now = func() time.Time { return time.Now().Add(2 * time.Minute) }
	_, err = service.Get("u", old.ID)
	require.ErrorIs(t, err, ErrNotFound)
}

// TestFFmpegFinishesEveryTarget runs the real encoders when ffmpeg is installed.
func TestFFmpegFinishesEveryTarget(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg is not installed")
	}
	if _, err := exec.LookPath("ffprobe"); err != nil {
		t.Skip("ffprobe is not installed")
	}
	source := filepath.Join(t.TempDir(), "source.mp4")
	out, err := exec.CommandContext(t.Context(), ffmpeg, "-hide_banner", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30:duration=1",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source).CombinedOutput()
	require.NoError(t, err, string(out))

	service := New(Config{Enabled: true, FFmpeg: ffmpeg})
	for _, target := range Targets {
		t.Run(target.ID, func(t *testing.T) {
			input := filepath.Join(t.TempDir(), "upload.mp4")
			raw, err := os.ReadFile(source)
			require.NoError(t, err)
			require.NoError(t, os.WriteFile(input, raw, 0o600))
			job, err := service.Start("u", target.ID, "Launch", true, input)
			require.NoError(t, err)
			done := waitFor(t, service, "u", job.ID)
			require.Equal(t, StatusDone, done.Status, done.Error)
			require.Equal(t, "Launch"+target.Extension, done.FileName)

			_, file, err := service.Open("u", job.ID)
			require.NoError(t, err)
			path := file.(*removeOnClose).Name()
			probe, err := exec.CommandContext(t.Context(), "ffprobe", "-v", "error", "-show_entries", "stream=codec_name", "-of", "csv=p=0", path).Output()
			require.NoError(t, file.Close())
			require.NoError(t, err)
			codecs := strings.Fields(strings.ReplaceAll(string(probe), ",", " "))
			want := map[string]string{"prores-hq": "prores", "hevc": "hevc", "h264-small": "h264"}[target.ID]
			require.True(t, slices.Contains(codecs, want), "codecs %v", codecs)
		})
	}
}
