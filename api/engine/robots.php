<?php
class RobotsTxtParser
{

    private $rules = [];
    private $domain;

    public function __construct($domain)
    {
        $this->domain = $domain;
    }

    public function fetchAndParse()
    {
        $robotsUrl = "https://" . $this->domain . "/robots.txt";

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $robotsUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'AURORA SEO Auditor (Hostinger)');
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
        $content = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 300 && $content) {
            $this->parseContent($content);
        }
    }

    private function parseContent($content)
    {
        $lines = explode("\n", $content);
        $currentUserAgent = '*';

        foreach ($lines as $line) {
            // Strip comments
            $line = preg_replace('/#.*$/', '', $line);
            $line = trim($line);
            if (empty($line))
                continue;

            if (preg_match('/^User-agent:\s*(.*)/i', $line, $matches)) {
                $currentUserAgent = strtolower(trim($matches[1]));
            } elseif (preg_match('/^Disallow:\s*(.*)/i', $line, $matches)) {
                $path = trim($matches[1]);
                if (!empty($path) && ($currentUserAgent === '*' || strpos($currentUserAgent, 'aurora') !== false)) {
                    // Convert robots.txt pattern to basic regex
                    $regex = str_replace(['*', '?'], ['.*', '\?'], $path);
                    $this->rules[] = '#^' . $regex . '#i';
                }
            }
        }
    }

    public function isAllowed($urlPath)
    {
        if (empty($this->rules))
            return true;

        foreach ($this->rules as $rule) {
            if (preg_match($rule, $urlPath)) {
                return false;
            }
        }
        return true;
    }

    public function getRulesJson()
    {
        return json_encode($this->rules);
    }
}
?>