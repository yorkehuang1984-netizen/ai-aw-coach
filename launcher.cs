using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

class Launcher
{
    static string ProjectDir = AppDomain.CurrentDomain.BaseDirectory;
    static string ServerLog = "";

    static void Main()
    {
        // 1. Check Node.js
        try
        {
            var psi = new ProcessStartInfo("where", "node")
            {
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            var p = Process.Start(psi);
            p.WaitForExit(2000);
            if (p.ExitCode != 0)
            {
                ShowError("Node.js not found.\n\nPlease install Node.js from:\nhttps://nodejs.org");
                return;
            }
        }
        catch
        {
            ShowError("Node.js not found.\n\nPlease install Node.js from:\nhttps://nodejs.org");
            return;
        }

        // 2. Check project dir
        if (!Directory.Exists(ProjectDir) || !File.Exists(Path.Combine(ProjectDir, "server.js")))
        {
            ShowError("Project files not found in:\n" + ProjectDir);
            return;
        }

        // 3. Check .env
        if (!File.Exists(Path.Combine(ProjectDir, ".env")))
        {
            ShowError(".env config file is missing.\n\nCreate .env with:\nDEEPSEEK_API_KEY=sk-your-key");
            return;
        }

        // 4. Kill any process on port 3000
        KillPort3000();

        // 5. Start server
        Process serverProcess;
        try
        {
            serverProcess = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "node",
                    Arguments = "server.js",
                    WorkingDirectory = ProjectDir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                },
                EnableRaisingEvents = true
            };
            serverProcess.OutputDataReceived += (s, e) => { if (e.Data != null) ServerLog += e.Data + "\n"; };
            serverProcess.ErrorDataReceived += (s, e) => { if (e.Data != null) ServerLog += e.Data + "\n"; };
            serverProcess.Start();
            serverProcess.BeginOutputReadLine();
            serverProcess.BeginErrorReadLine();
        }
        catch (Exception ex)
        {
            ShowError("Failed to start server:\n" + ex.Message);
            return;
        }

        // 6. Wait for port 3000 (max 30 seconds)
        bool ready = false;
        for (int i = 0; i < 30; i++)
        {
            if (IsPortOpen("localhost", 3000))
            {
                ready = true;
                break;
            }
            Thread.Sleep(1000);
        }

        if (!ready)
        {
            ShowError("Server startup timeout (30s).\n\nServer log:\n" +
                (ServerLog.Length > 500 ? ServerLog.Substring(ServerLog.Length - 500) : ServerLog));
            try { serverProcess.Kill(); } catch { }
            return;
        }

        // 7. Open browser
        try
        {
            Process.Start("http://localhost:3000");
        }
        catch { }

        // 8. Exit (server keeps running)
    }

    static bool IsPortOpen(string host, int port)
    {
        try
        {
            using (var client = new TcpClient())
            {
                var result = client.BeginConnect(host, port, null, null);
                var success = result.AsyncWaitHandle.WaitOne(TimeSpan.FromSeconds(1));
                if (!success) return false;
                client.EndConnect(result);
                return true;
            }
        }
        catch { return false; }
    }

    static void KillPort3000()
    {
        try
        {
            var psi = new ProcessStartInfo("netstat", "-ano")
            {
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            var p = Process.Start(psi);
            string output = p.StandardOutput.ReadToEnd();
            p.WaitForExit();

            foreach (string line in output.Split('\n'))
            {
                if (line.Contains(":3000") && line.Contains("LISTENING"))
                {
                    string[] parts = line.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 5)
                    {
                        try
                        {
                            var killP = Process.Start("taskkill", "/f /pid " + parts[4]);
                            killP.WaitForExit(2000);
                        }
                        catch { }
                    }
                }
            }
        }
        catch { }
    }

    static void ShowError(string msg)
    {
        MessageBox.Show(msg, "AW-AI Coach", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}
