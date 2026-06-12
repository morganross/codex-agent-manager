using System;
using System.Diagnostics;
using System.IO;
using System.Text;

class Program
{
    static void Main()
    {
        string binDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "QexowCam", "bin");
        string camExe = Path.Combine(binDir, "cam-core.exe");

        string args = "send antigravity-cam-and-bridge-agent \"what is your status\"";

        ProcessStartInfo processInfo = new ProcessStartInfo
        {
            FileName = camExe,
            Arguments = args,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = binDir,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };

        using (Process process = Process.Start(processInfo))
        {
            process.WaitForExit();
            string output = process.StandardOutput.ReadToEnd();
            string error = process.StandardError.ReadToEnd();
            
            if (!string.IsNullOrWhiteSpace(error))
            {
                output = output + "\n" + error;
            }
            if (string.IsNullOrWhiteSpace(output)) {
                output = "Command executed successfully.";
            }
            Console.WriteLine("OUTPUT: " + output);
            Console.WriteLine("CONTAINS ERROR: " + output.Contains("Error"));
        }
    }
}
